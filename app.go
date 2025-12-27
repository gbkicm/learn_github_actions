package main

import (
	"context"
	"fmt"
	"log/slog"
	"path/filepath"

	"vadcondense/internal/vad"

	"github.com/wailsapp/wails/v2/pkg/runtime"
)

// App struct
type App struct {
	ctx context.Context
}

// NewApp creates a new App application struct
func NewApp() *App {
	return &App{}
}

// startup is called when the app starts. The context is saved
// so we can call the runtime methods
func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

// Greet returns a greeting for the given name
func (a *App) Greet(name string) string {
	return fmt.Sprintf("Hello %s, It's show time!", name)
}

// CondenseProgress represents progress updates sent to the frontend via events
type CondenseProgress struct {
	FilePath string `json:"filePath"`
	Status   string `json:"status"`
	Error    string `json:"error,omitempty"`
}

// CondenseOptions contains all configurable settings for audio processing
type CondenseOptions struct {
	OutputSuffix       string  `json:"outputSuffix"`
	OutputDir          string  `json:"outputDir"`
	OutputFormat       string  `json:"outputFormat"`
	VadThreshold       float64 `json:"vadThreshold"`
	MinSilenceDuration int     `json:"minSilenceDuration"`
	SpeechPaddingMs    int     `json:"speechPaddingMs"`
}

// CondenseFiles processes multiple audio files and removes silence from each.
func (a *App) CondenseFiles(filePaths []string, options CondenseOptions) {
	slog.Info("Starting batch condense", "fileCount", len(filePaths))

	for i, filePath := range filePaths {
		slog.Debug("Processing file", "index", i+1, "total", len(filePaths), "file", filePath)

		// Emit progress event for the frontend
		runtime.EventsEmit(a.ctx, "condense:progress", CondenseProgress{
			FilePath: filePath,
			Status:   "pending",
		})

		// Status callback emits events for each stage
		statusCallback := func(status string) {
			runtime.EventsEmit(a.ctx, "condense:progress", CondenseProgress{
				FilePath: filePath,
				Status:   status,
			})
		}

		err := vad.CondenseWithOptions(
			filePath,
			options.OutputDir,
			options.OutputSuffix,
			options.OutputFormat,
			float32(options.VadThreshold),
			options.MinSilenceDuration,
			options.SpeechPaddingMs,
			nil, // progressCallback (silent for now)
			statusCallback,
		)

		// Emit completion event for this file
		status := "completed"
		errMsg := ""
		if err != nil {
			status = "error"
			errMsg = err.Error()
			slog.Error("File processing failed", "file", filePath, "error", err)
		}
		runtime.EventsEmit(a.ctx, "condense:progress", CondenseProgress{
			FilePath: filePath,
			Status:   status,
			Error:    errMsg,
		})
	}

	slog.Info("Batch condense complete", "fileCount", len(filePaths))
}

// BrowseFiles opens a native file dialog for selecting audio files
func (a *App) BrowseFiles() ([]string, error) {
	files, err := runtime.OpenMultipleFilesDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Audio Files",
		Filters: []runtime.FileFilter{
			{
				DisplayName: "Audio Files",
				Pattern:     "*.wav",
			},
		},
	})
	if err != nil {
		return nil, err
	}
	return files, nil
}

// GetFileName returns just the filename from a full path
func (a *App) GetFileName(path string) string {
	return filepath.Base(path)
}

// SelectDirectory opens a native directory picker dialog
func (a *App) SelectDirectory() (string, error) {
	dir, err := runtime.OpenDirectoryDialog(a.ctx, runtime.OpenDialogOptions{
		Title: "Select Output Directory",
	})
	if err != nil {
		return "", err
	}
	return dir, nil
}

// OpenDirectory opens the specified directory in the system file browser
func (a *App) OpenDirectory(path string) error {
	runtime.BrowserOpenURL(a.ctx, "file://"+path)
	return nil
}
