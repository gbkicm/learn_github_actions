import { useState, useEffect, DragEvent } from 'react';
import './App.css';
import { CondenseFiles, BrowseFiles, GetFileName, SelectDirectory, OpenDirectory } from "../wailsjs/go/main/App";
import { EventsOn, EventsOff } from "../wailsjs/runtime/runtime";

interface FileItem {
    path: string;
    name: string;
    status: 'pending' | 'loading' | 'detecting' | 'exporting' | 'completed' | 'error';
    error?: string;
}

interface Settings {
    outputSuffix: string;
    outputDir: string;
    outputFormat: string;
    vadThreshold: number;
    minSilenceDuration: number;
    speechPaddingMs: number;
}

const DEFAULT_SETTINGS: Settings = {
    outputSuffix: '_condensed',
    outputDir: '',
    outputFormat: 'mp3',
    vadThreshold: 0.3,
    minSilenceDuration: 200,
    speechPaddingMs: 200,
};

function App() {
    const [files, setFiles] = useState<FileItem[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragOver, setIsDragOver] = useState(false);
    const [settings, setSettings] = useState<Settings>(() => {
        const saved = localStorage.getItem('vadcondense-settings');
        return saved ? JSON.parse(saved) : DEFAULT_SETTINGS;
    });

    // Save settings to localStorage whenever they change
    useEffect(() => {
        localStorage.setItem('vadcondense-settings', JSON.stringify(settings));
    }, [settings]);

    const updateSetting = <K extends keyof Settings>(key: K, value: Settings[K]) => {
        setSettings(prev => ({ ...prev, [key]: value }));
    };

    const resetOutputSettings = () => {
        setSettings(prev => ({
            ...prev,
            outputSuffix: DEFAULT_SETTINGS.outputSuffix,
            outputDir: DEFAULT_SETTINGS.outputDir,
            outputFormat: DEFAULT_SETTINGS.outputFormat,
        }));
    };

    const resetVadSettings = () => {
        setSettings(prev => ({
            ...prev,
            vadThreshold: DEFAULT_SETTINGS.vadThreshold,
            minSilenceDuration: DEFAULT_SETTINGS.minSilenceDuration,
            speechPaddingMs: DEFAULT_SETTINGS.speechPaddingMs,
        }));
    };

    const handleSelectDirectory = async () => {
        try {
            const dir = await SelectDirectory();
            if (dir) {
                updateSetting('outputDir', dir);
            }
        } catch (err) {
            console.error("Failed to select directory:", err);
        }
    };

    const handleOpenDirectory = async () => {
        const dirToOpen = settings.outputDir || (files.length > 0 ? files[0].path.substring(0, files[0].path.lastIndexOf('/')) : '');
        if (dirToOpen) {
            try {
                await OpenDirectory(dirToOpen);
            } catch (err) {
                console.error("Failed to open directory:", err);
            }
        }
    };

    // Listen for progress events from the backend
    useEffect(() => {
        const unsubscribe = EventsOn("condense:progress", (data: any) => {
            setFiles(prev => prev.map(f =>
                f.path === data.filePath
                    ? { ...f, status: data.status, error: data.error }
                    : f
            ));
        });

        return () => {
            EventsOff("condense:progress");
        };
    }, []);

    const handleDragOver = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(true);
    };

    const handleDragLeave = (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);
    };

    const handleDrop = async (e: DragEvent<HTMLDivElement>) => {
        e.preventDefault();
        setIsDragOver(false);

        // In Wails, dropped files come as file paths in the dataTransfer
        const droppedFiles = Array.from(e.dataTransfer.files);

        for (const file of droppedFiles) {
            // Wails provides the full path via the File object's path property
            const filePath = (file as any).path || file.name;
            const fileName = await GetFileName(filePath);

            // Avoid duplicates
            setFiles(prev => {
                if (prev.some(f => f.path === filePath)) {
                    return prev;
                }
                return [...prev, {
                    path: filePath,
                    name: fileName,
                    status: 'pending'
                }];
            });
        }
    };

    const handleBrowseFiles = async () => {
        try {
            const selectedPaths = await BrowseFiles();
            if (selectedPaths && selectedPaths.length > 0) {
                const newFiles: FileItem[] = [];
                for (const filePath of selectedPaths) {
                    const fileName = await GetFileName(filePath);
                    if (!files.some(f => f.path === filePath)) {
                        newFiles.push({
                            path: filePath,
                            name: fileName,
                            status: 'pending'
                        });
                    }
                }
                setFiles(prev => [...prev, ...newFiles]);
            }
        } catch (err) {
            console.error("Failed to browse files:", err);
        }
    };

    const handleCondense = async () => {
        if (files.length === 0 || isProcessing) return;

        setIsProcessing(true);
        // Reset all files to pending status
        setFiles(prev => prev.map(f => ({ ...f, status: 'pending' as const, error: undefined })));

        const filePaths = files.map(f => f.path);

        try {
            await CondenseFiles(filePaths, settings);
        } catch (err) {
            console.error("Condensing failed:", err);
        } finally {
            setIsProcessing(false);
        }
    };

    const handleClear = () => {
        if (isProcessing) return;
        setFiles([]);
    };

    const removeFile = (path: string) => {
        if (isProcessing) return;
        setFiles(prev => prev.filter(f => f.path !== path));
    };

    const getStatusIcon = (status: FileItem['status']) => {
        switch (status) {
            case 'pending': return '⏳';
            case 'loading': return '📂';
            case 'detecting': return '🔍';
            case 'exporting': return '💾';
            case 'completed': return '✅';
            case 'error': return '❌';
        }
    };

    const getStatusText = (status: FileItem['status']) => {
        switch (status) {
            case 'pending': return 'Pending';
            case 'loading': return 'Loading file';
            case 'detecting': return 'Detecting speech';
            case 'exporting': return 'Exporting result';
            case 'completed': return 'Done';
            case 'error': return 'Error';
        }
    };

    return (
        <div id="App">
            <div
                className={`drop-zone ${isDragOver ? 'drag-over' : ''} ${files.length > 0 ? 'has-files' : ''}`}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                {files.length === 0 ? (
                    <div className="drop-placeholder">
                        <span className="drop-icon">📁</span>
                        <p>Drag & drop audio files here</p>
                        <p className="drop-hint">or</p>
                        <button className="btn btn-secondary" onClick={handleBrowseFiles}>
                            Browse Files
                        </button>
                    </div>
                ) : (
                    <div className="file-list">
                        {files.map((file) => (
                            <div key={file.path} className={`file-item ${file.status}`}>
                                <div className="file-status">
                                    <span className="file-status-icon">{getStatusIcon(file.status)}</span>
                                    <span className="file-status-text">{getStatusText(file.status)}</span>
                                </div>
                                <span className="file-name" title={file.path}>{file.name}</span>
                                {file.error && <span className="file-error" title={file.error}>!</span>}
                                {!isProcessing && (
                                    <button
                                        className="file-remove"
                                        onClick={() => removeFile(file.path)}
                                        title="Remove file"
                                    >
                                        ×
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>

            {files.length > 0 && (
                <div className="actions">
                    <button
                        className="btn btn-primary"
                        onClick={handleCondense}
                        disabled={isProcessing}
                    >
                        {isProcessing ? 'Processing...' : 'Start Condensing'}
                    </button>
                    <button
                        className="btn btn-secondary"
                        onClick={handleClear}
                        disabled={isProcessing}
                    >
                        Clear List
                    </button>
                    {!isProcessing && files.length > 0 && (
                        <button className="btn btn-secondary" onClick={handleBrowseFiles}>
                            Add More Files
                        </button>
                    )}
                </div>
            )}

            <div className="settings-grid">
                <div className="settings-panel">
                    <div className="settings-section">
                        <div className="settings-header">
                            <h3>Output Settings</h3>
                            <button 
                                className="reset-section-btn" 
                                onClick={resetOutputSettings}
                                title="Reset output settings to defaults"
                            >
                                ↺
                            </button>
                        </div>
                        
                        <div className="settings-content">
                                <label>
                                    Output Suffix
                                    <input
                                        type="text"
                                        value={settings.outputSuffix}
                                        onChange={(e) => updateSetting('outputSuffix', e.target.value)}
                                        placeholder="e.g., _condensed"
                                    />
                                </label>

                                <label>
                                    Output Format
                                    <select
                                        value={settings.outputFormat}
                                        onChange={(e) => updateSetting('outputFormat', e.target.value)}
                                    >
                                        <option value="mp3">MP3</option>
                                        <option value="wav">WAV</option>
                                        <option value="flac">FLAC</option>
                                        <option value="opus">OPUS</option>
                                    </select>
                                </label>

                                <label>
                                    Output Directory
                                    <div className="dir-input-group">
                                        <input
                                            type="text"
                                            value={settings.outputDir}
                                            onChange={(e) => updateSetting('outputDir', e.target.value)}
                                            placeholder="Same as input file"
                                        />
                                        <button className="btn btn-secondary" onClick={handleSelectDirectory}>
                                            Browse
                                        </button>
                                        <button
                                            className="btn btn-secondary"
                                            onClick={handleOpenDirectory}
                                            disabled={!settings.outputDir && files.length === 0}
                                            title="Open output directory"
                                        >
                                            📁
                                        </button>
                                    </div>
                                </label>
                        </div>
                    </div>
                </div>

                <div className="settings-panel">
                    <div className="settings-section">
                        <div className="settings-header">
                            <h3>VAD Settings</h3>
                            <button 
                                className="reset-section-btn" 
                                onClick={resetVadSettings}
                                title="Reset VAD settings to defaults"
                            >
                                ↺
                            </button>
                        </div>
                        
                        <div className="settings-content">
                                <label>
                                    Min Silence Duration (ms)
                                    <input
                                        type="number"
                                        min="50"
                                        max="2000"
                                        step="50"
                                        value={settings.minSilenceDuration}
                                        onChange={(e) => updateSetting('minSilenceDuration', parseInt(e.target.value) || 200)}
                                    />
                                </label>

                                <label>
                                    Speech Padding (ms)
                                    <input
                                        type="number"
                                        min="0"
                                        max="500"
                                        step="10"
                                        value={settings.speechPaddingMs}
                                        onChange={(e) => updateSetting('speechPaddingMs', parseInt(e.target.value) || 200)}
                                    />
                                </label>

                                <label>
                                    VAD Threshold: {settings.vadThreshold.toFixed(2)}
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={settings.vadThreshold}
                                        onChange={(e) => updateSetting('vadThreshold', parseFloat(e.target.value))}
                                    />
                                    <span className="range-hint">Lower = more sensitive to speech</span>
                                </label>

                        </div>
                    </div>
                </div>
            </div>
        </div>
    )
}

export default App
