import { useState, useEffect, useCallback } from 'react';
import {
  Header,
  FileUpload,
  FileList,
  MarkdownPreview,
  ProcessingOptions,
  ProjectSidebar,
} from './components';
import { usePDFProcessor } from './hooks/usePDFProcessor';
import { useProjects } from './hooks/useProjects';
import './App.css';

function App() {
  const {
    projects,
    activeProjectId,
    fileCounts,
    isLoading: projectsLoading,
    createProject,
    renameProject,
    deleteProject,
    selectProject,
    refreshFileCounts,
  } = useProjects();

  const {
    files,
    options,
    isProcessing,
    isLoading: filesLoading,
    addFiles,
    removeFile,
    clearFiles,
    setOptions,
    processAllFiles,
    processSingleFile,
    cleanup,
  } = usePDFProcessor({
    projectId: activeProjectId,
    onFilesChanged: refreshFileCounts,
  });

  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isNarrowScreen, setIsNarrowScreen] = useState(() => window.innerWidth <= 1200);
  const [activeTab, setActiveTab] = useState<'documents' | 'upload'>('documents');

  // Listen for screen size changes
  // Synced with CSS breakpoint at 1200px where tabs appear and upload panel hides
  // Uses both resize event and matchMedia for WebKit/Tauri compatibility
  useEffect(() => {
    const BREAKPOINT = 1200;

    const checkWidth = () => {
      const isNarrow = window.innerWidth <= BREAKPOINT;
      setIsNarrowScreen(isNarrow);
      // Reset to documents tab when switching to wide screen
      if (!isNarrow) {
        setActiveTab('documents');
      }
    };

    // Initial check after mount (WebKit may need a frame to settle)
    requestAnimationFrame(checkWidth);

    // Listen via resize event (more reliable in WebKit)
    window.addEventListener('resize', checkWidth);

    // Also listen via matchMedia as backup
    const mediaQuery = window.matchMedia(`(max-width: ${BREAKPOINT}px)`);
    const handleMediaChange = (e: MediaQueryListEvent) => {
      setIsNarrowScreen(e.matches);
      if (!e.matches) {
        setActiveTab('documents');
      }
    };
    mediaQuery.addEventListener('change', handleMediaChange);

    return () => {
      window.removeEventListener('resize', checkWidth);
      mediaQuery.removeEventListener('change', handleMediaChange);
    };
  }, []);

  const handleCreateProject = useCallback(async (name: string) => {
    const project = await createProject(name);
    selectProject(project.id);
  }, [createProject, selectProject]);

  // Auto-select first file when files change
  useEffect(() => {
    if (files.length > 0 && !selectedFileId) {
      setSelectedFileId(files[0].id);
    } else if (files.length === 0) {
      setSelectedFileId(null);
    } else if (selectedFileId && !files.find((f) => f.id === selectedFileId)) {
      setSelectedFileId(files[0]?.id || null);
    }
  }, [files, selectedFileId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanup();
    };
  }, [cleanup]);

  const selectedFile = files.find((f) => f.id === selectedFileId) || null;

  // Show loading state while projects are loading
  if (projectsLoading) {
    return (
      <div className="app">
        <div className="app-loading">
          <div className="spinner" />
          <p>Loading projects...</p>
        </div>
      </div>
    );
  }

  return (
    <div className={`app ${isNarrowScreen ? 'is-narrow' : ''}`}>
      <Header
        files={files}
        isProcessing={isProcessing}
        onProcessAll={processAllFiles}
        onClearAll={clearFiles}
      />

      <main className="app-main">
        {/* Project Sidebar */}
        <ProjectSidebar
          projects={projects}
          activeProjectId={activeProjectId}
          fileCounts={fileCounts}
          onSelectProject={selectProject}
          onCreateProject={handleCreateProject}
          onRenameProject={renameProject}
          onDeleteProject={deleteProject}
        />

        {/* Content Area - Bubbles */}
        <div className="content-bubbles">
          {/* Upload & Settings Panel - Hidden on narrow screens */}
          <aside className="panel panel-upload">
            <div className="panel-header">
              <h2>Upload</h2>
            </div>
            <div className="panel-content">
              <FileUpload onFilesSelected={addFiles} disabled={isProcessing} />
              <ProcessingOptions
                options={options}
                onChange={setOptions}
                disabled={isProcessing}
              />
            </div>
          </aside>

          {/* Combined Files/Upload Panel - Shows tabs on narrow screens */}
          <aside className="panel panel-files">
            <div className="panel-header">
              {/* Normal title - hidden when narrow */}
              <h2 className="panel-title-wide">Documents</h2>

              {/* Tabs - shown when narrow */}
              <div className="panel-tabs">
                <button
                  className={`panel-tab ${activeTab === 'documents' ? 'active' : ''}`}
                  onClick={() => setActiveTab('documents')}
                >
                  Documents
                </button>
                <button
                  className={`panel-tab ${activeTab === 'upload' ? 'active' : ''}`}
                  onClick={() => setActiveTab('upload')}
                >
                  Upload
                </button>
              </div>

              <span className="file-count">{files.length}</span>
            </div>
            <div className={`panel-content ${isNarrowScreen && activeTab === 'upload' ? 'upload-tab-active' : ''}`}>
              {isNarrowScreen && activeTab === 'upload' ? (
                <>
                  <FileUpload onFilesSelected={(newFiles) => {
                    addFiles(newFiles);
                    setActiveTab('documents');
                  }} disabled={isProcessing} />
                  <ProcessingOptions
                    options={options}
                    onChange={setOptions}
                    disabled={isProcessing}
                  />
                </>
              ) : filesLoading ? (
                <div className="files-loading">
                  <div className="spinner small" />
                  <p>Loading files...</p>
                </div>
              ) : (
                <FileList
                  files={files}
                  selectedFileId={selectedFileId}
                  onSelectFile={setSelectedFileId}
                  onRemoveFile={removeFile}
                  onProcessFile={processSingleFile}
                  isProcessing={isProcessing}
                />
              )}
            </div>
          </aside>

          {/* Preview Panel */}
          <section className="panel panel-preview">
            <MarkdownPreview file={selectedFile} />
          </section>
        </div>
      </main>
    </div>
  );
}

export default App;

