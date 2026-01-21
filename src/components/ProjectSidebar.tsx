import { useState, useRef, useEffect } from 'react';
import { FolderPlus, Folder, MoreVertical, Pencil, Trash2, X, Check } from 'lucide-react';
import logo from '../assets/logo.png';
import type { Project } from '../types';

interface ProjectSidebarProps {
  projects: Project[];
  activeProjectId: string;
  fileCounts: Map<string, number>;
  onSelectProject: (id: string) => void;
  onCreateProject: (name: string) => Promise<void>;
  onRenameProject: (id: string, name: string) => Promise<void>;
  onDeleteProject: (id: string) => Promise<void>;
}

export function ProjectSidebar({
  projects,
  activeProjectId,
  fileCounts,
  onSelectProject,
  onCreateProject,
  onRenameProject,
  onDeleteProject,
}: ProjectSidebarProps) {
  const [isCreating, setIsCreating] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);

  const newInputRef = useRef<HTMLInputElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Focus input when creating new project
  useEffect(() => {
    if (isCreating && newInputRef.current) {
      newInputRef.current.focus();
    }
  }, [isCreating]);

  // Focus input when editing
  useEffect(() => {
    if (editingId && editInputRef.current) {
      editInputRef.current.focus();
      editInputRef.current.select();
    }
  }, [editingId]);

  // Close menu when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setMenuOpenId(null);
      }
    }

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleCreateProject = async () => {
    const name = newProjectName.trim();
    if (!name) {
      setIsCreating(false);
      return;
    }

    try {
      await onCreateProject(name);
      setNewProjectName('');
      setIsCreating(false);
    } catch (error) {
      console.error('Failed to create project:', error);
    }
  };

  const handleRenameProject = async () => {
    if (!editingId) return;

    const name = editingName.trim();
    if (!name) {
      setEditingId(null);
      return;
    }

    try {
      await onRenameProject(editingId, name);
      setEditingId(null);
      setEditingName('');
    } catch (error) {
      console.error('Failed to rename project:', error);
    }
  };

  const handleDeleteProject = async (id: string) => {
    try {
      await onDeleteProject(id);
      setDeleteConfirmId(null);
    } catch (error) {
      console.error('Failed to delete project:', error);
    }
  };

  const startEditing = (project: Project) => {
    setEditingId(project.id);
    setEditingName(project.name);
    setMenuOpenId(null);
  };

  const startDelete = (id: string) => {
    setDeleteConfirmId(id);
    setMenuOpenId(null);
  };

  return (
    <aside className="project-sidebar">
      <div className="sidebar-header">
        <h2>Projects</h2>
        <button
          className="sidebar-action-btn"
          onClick={() => setIsCreating(true)}
          title="New Project"
        >
          <FolderPlus size={16} />
        </button>
      </div>

      <div className="sidebar-content">
        {/* New project input */}
        {isCreating && (
          <div className="project-create-form">
            <input
              ref={newInputRef}
              type="text"
              value={newProjectName}
              onChange={(e) => setNewProjectName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateProject();
                if (e.key === 'Escape') setIsCreating(false);
              }}
              placeholder="Project name"
              className="project-name-input"
            />
            <div className="project-form-actions">
              <button className="form-btn confirm" onClick={handleCreateProject}>
                <Check size={14} />
                Create
              </button>
              <button className="form-btn cancel" onClick={() => setIsCreating(false)}>
                <X size={14} />
              </button>
            </div>
          </div>
        )}

        {/* Project list */}
        <ul className="project-list">
          {projects.map((project) => (
            <li key={project.id}>
              {editingId === project.id ? (
                <div className="project-create-form">
                  <input
                    ref={editInputRef}
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleRenameProject();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                    className="project-name-input"
                  />
                  <div className="project-form-actions">
                    <button className="form-btn confirm" onClick={handleRenameProject}>
                      <Check size={14} />
                      Save
                    </button>
                    <button className="form-btn cancel" onClick={() => setEditingId(null)}>
                      <X size={14} />
                    </button>
                  </div>
                </div>
              ) : deleteConfirmId === project.id ? (
                <div className="project-delete-confirm">
                  <span className="delete-message">Delete "{project.name}"?</span>
                  <div className="project-form-actions">
                    <button
                      className="form-btn danger"
                      onClick={() => handleDeleteProject(project.id)}
                    >
                      <Trash2 size={12} />
                      Delete
                    </button>
                    <button
                      className="form-btn cancel"
                      onClick={() => setDeleteConfirmId(null)}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className={`project-item ${activeProjectId === project.id ? 'active' : ''}`}
                  onClick={() => onSelectProject(project.id)}
                >
                  {activeProjectId === project.id ? (
                    <img src={logo} alt="Active Project" className="project-icon-img" />
                  ) : (
                    <Folder size={16} className="project-icon" />
                  )}
                  <span className="project-name">{project.name}</span>
                  <span className="project-count">{fileCounts.get(project.id) || 0}</span>
                  <div className="project-menu-container" ref={menuOpenId === project.id ? menuRef : null}>
                    <button
                      className="project-menu-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId(menuOpenId === project.id ? null : project.id);
                      }}
                    >
                      <MoreVertical size={14} />
                    </button>
                    {menuOpenId === project.id && (
                      <div className="project-menu">
                        <button onClick={() => startEditing(project)}>
                          <Pencil size={14} />
                          Rename
                        </button>
                        {projects.length > 1 && (
                          <button className="danger" onClick={() => startDelete(project.id)}>
                            <Trash2 size={14} />
                            Delete
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      </div>
    </aside>
  );
}
