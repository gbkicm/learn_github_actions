package vad

import (
	"bytes"
	"encoding/binary"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"path/filepath"
	"strings"

	"github.com/jjsteffen/silero-vad-go/speech"
)

// StatusCallback is called at each stage of the conversion process
type StatusCallback func(status string)

// decodeToFloat32 uses ffmpeg to decode any audio format to raw PCM float32 samples.
// Returns the samples as []float32 at the specified sample rate (mono).
func decodeToFloat32(inFile string, sampleRate int) ([]float32, error) {
	slog.Debug("Decoding audio file", "file", inFile, "sampleRate", sampleRate)

	args := []string{
		"-i", inFile,
		"-f", "f32le", // 32-bit float, little-endian
		"-acodec", "pcm_f32le",
		"-ac", "1", // mono
		"-ar", fmt.Sprintf("%d", sampleRate),
		"-", // output to stdout
	}

	cmd := exec.Command("ffmpeg", args...)
	var stdout bytes.Buffer
	var stderr bytes.Buffer
	cmd.Stdout = &stdout
	cmd.Stderr = &stderr

	if err := cmd.Run(); err != nil {
		return nil, fmt.Errorf("ffmpeg decode error: %w, stderr: %s", err, stderr.String())
	}

	// Parse raw float32 samples from stdout
	data := stdout.Bytes()
	numSamples := len(data) / 4 // 4 bytes per float32
	samples := make([]float32, numSamples)

	reader := bytes.NewReader(data)
	for i := 0; i < numSamples; i++ {
		if err := binary.Read(reader, binary.LittleEndian, &samples[i]); err != nil {
			if err == io.EOF {
				break
			}
			return nil, fmt.Errorf("failed to read sample %d: %w", i, err)
		}
	}

	slog.Debug("Audio decoded", "samples", len(samples), "durationSec", float64(len(samples))/float64(sampleRate))
	return samples, nil
}

// CondenseWithOptions processes a single audio file and removes silence.
// Supports any audio format that ffmpeg can decode (mp3, wav, flac, m4a, ogg, etc.)
// The progressCallback and statusCallback parameters are optional - pass nil for silent operation.
func CondenseWithOptions(inFile, outDir, outSuffix, outFormat string, threshold float32, minSilenceDuration, padMs int, progressCallback func(float64), statusCallback StatusCallback) error {
	const sampleRate = 16000

	slog.Debug("Options", "threshold", threshold, "minSilenceDuration", minSilenceDuration, "padMs", padMs, "outFormat", outFormat)

	// Use a no-op callback if none provided
	if progressCallback == nil {
		progressCallback = func(float64) {}
	}
	if statusCallback == nil {
		statusCallback = func(string) {}
	}

	// Decode input file to raw float32 samples using ffmpeg
	statusCallback("loading")
	samples, err := decodeToFloat32(inFile, sampleRate)
	if err != nil {
		return fmt.Errorf("failed to decode audio file: %w", err)
	}

	statusCallback("detecting")
	sd, err := speech.NewDetector(speech.DetectorConfig{
		ModelPath:            "./silero_vad.onnx",
		SampleRate:           sampleRate,
		Threshold:            threshold,
		MinSilenceDurationMs: minSilenceDuration,
		SpeechPadMs:          padMs,
		ProgressCallback:     progressCallback,
	})
	if err != nil {
		return fmt.Errorf("failed to create speech detector: %w", err)
	}
	defer sd.Destroy()

	slog.Info("Detecting speech segments", "file", inFile)
	// Silence library debug logs during detection
	originalDefault := slog.Default()
	slog.SetDefault(slog.New(slog.NewTextHandler(io.Discard, nil)))

	segments, err := sd.Detect(samples)

	// Restore original logger
	slog.SetDefault(originalDefault)

	if err != nil {
		return fmt.Errorf("speech detection failed: %w", err)
	}

	if len(segments) == 0 {
		slog.Warn("No speech detected", "file", inFile)
		return fmt.Errorf("no speech detected in file: %s", inFile)
	}

	slog.Debug("Speech segments detected", "count", len(segments))

	cuts := make([]string, len(segments))
	for i, s := range segments {
		cuts[i] = fmt.Sprintf("between(t,%.2f,%.2f)", s.SpeechStartAt, s.SpeechEndAt)
	}

	af := fmt.Sprintf("aselect='%s',asetpts=N/SR/TB", strings.Join(cuts, "+"))

	ext := filepath.Ext(inFile)
	baseName := filepath.Base(inFile)
	inDir := filepath.Dir(inFile)

	if outDir == "" {
		outDir = inDir
	}

	outName := filepath.Join(outDir, strings.TrimSuffix(baseName, ext)+outSuffix+"."+outFormat)

	slog.Debug("Creating output file", "file", outName)

	statusCallback("exporting")
	// Use ffmpeg to extract speech segments from the ORIGINAL file (preserves quality)
	args := []string{
		"-y",
		"-i", inFile,
		"-vn",
		"-af", af,
		outName,
	}

	cmd := exec.Command("ffmpeg", args...)
	output, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("ffmpeg error: %w, output: %s", err, string(output))
	}

	slog.Info("File processed successfully", "input", inFile, "output", outName)
	return nil
}
