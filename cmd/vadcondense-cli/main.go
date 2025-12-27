package main

import (
	"fmt"
	"log"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"
	"vadcondense/internal/vad"

	"github.com/briandowns/spinner"
	"github.com/spf13/pflag"
)

func printProgress(p float64) {
	pct := int(p * 100)
	const width = 40
	filled := int(float64(width) * p)
	if filled > width {
		filled = width
	}
	bar := strings.Repeat("█", filled) + strings.Repeat(" ", width-filled)

	fmt.Printf("\rvoice detection [%s] %3d%%", bar, pct)
	if p >= 1 {
		fmt.Println()
	}
}

func main() {
	var outDir, outSuffix, outFormat, thresholdStr string
	var minSilenceDuration, padMs int
	var verbose bool

	pflag.StringVarP(&outDir, "output-dir", "o", ".", "Output directory")
	pflag.StringVarP(&outSuffix, "suffix", "s", "_condensed", "Output file suffix")
	pflag.StringVarP(&outFormat, "format", "f", "wav", "Output file format")
	pflag.StringVarP(&thresholdStr, "threshold", "t", "0.3", "Silence threshold")
	pflag.IntVarP(&minSilenceDuration, "min-silence-duration", "m", 200, "Minimum silence duration in ms")
	pflag.IntVarP(&padMs, "pad-ms", "p", 200, "Padding in milliseconds")
	pflag.BoolVarP(&verbose, "verbose", "v", false, "Enable verbose logging")

	pflag.Parse()

	logLevel := slog.LevelWarn
	if verbose {
		logLevel = slog.LevelDebug
	}
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: logLevel,
	})))

	inputs := pflag.Args()
	if len(inputs) == 0 {
		fmt.Fprintln(os.Stderr, "usage: vadcondense-cli [flags] <files...>")
		pflag.PrintDefaults()
		os.Exit(2)
	}

	threshold, err := strconv.ParseFloat(thresholdStr, 32)
	if err != nil {
		log.Fatalf("failed to parse threshold: %s", err)
	}

	for i, inPath := range inputs {
		fmt.Printf("(%d/%d) Condensing %s\n", i+1, len(inputs), inPath)

		// Show loading spinner
		loadingSpinner := spinner.New(spinner.CharSets[43], 100*time.Millisecond)
		loadingSpinner.Suffix = " Processing..."
		loadingSpinner.Start()

		err := vad.CondenseWithOptions(
			inPath,
			outDir,
			outSuffix,
			outFormat,
			float32(threshold),
			minSilenceDuration,
			padMs,
			func(p float64) {
				loadingSpinner.Stop()
				printProgress(p)
			},
		)

		loadingSpinner.Stop()

		if err != nil {
			log.Fatalf("Error processing %s: %s", inPath, err)
		}

		fmt.Println("Done!")
	}
}
