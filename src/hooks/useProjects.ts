import { useState, useEffect, useCallback } from 'react';
import type { Project } from '../types';
import {
  getAllProjects,
  createProject as dbCreateProject,
  updateProject as dbUpdateProject,
  deleteProject as dbDeleteProject,
  getProjectFileCounts,
} from '../services/db';

const DEFAULT_PROJECT_ID = 'default';

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useProjects() {
  const [projects, setProjects] = useState<Project[]>([]);
  const [activeProjectId, setActiveProjectId] = useState<string>(DEFAULT_PROJECT_ID);
  const [fileCounts, setFileCounts] = useState<Map<string, number>>(new Map());
  const [isLoading, setIsLoading] = useState(true);

  // Load projects on mount
  useEffect(() => {
    async function loadProjects() {
      try {
        let loadedProjects = await getAllProjects();

        // Create default project if none exist
        if (loadedProjects.length === 0) {
          const defaultProject: Project = {
            id: DEFAULT_PROJECT_ID,
            name: 'Default',
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          await dbCreateProject(defaultProject);
          loadedProjects = [defaultProject];
        }

        setProjects(loadedProjects);

        // Load file counts
        const counts = await getProjectFileCounts();
        setFileCounts(counts);

        // Set active project to first if current doesn't exist
        const projectExists = loadedProjects.some((p) => p.id === activeProjectId);
        if (!projectExists && loadedProjects.length > 0) {
          setActiveProjectId(loadedProjects[0].id);
        }
      } catch (error) {
        console.error('Failed to load projects:', error);
      } finally {
        setIsLoading(false);
      }
    }

    loadProjects();
  }, []);

  const refreshFileCounts = useCallback(async () => {
    try {
      const counts = await getProjectFileCounts();
      setFileCounts(counts);
    } catch (error) {
      console.error('Failed to refresh file counts:', error);
    }
  }, []);

  const createProject = useCallback(async (name: string, description?: string) => {
    const project: Project = {
      id: generateId(),
      name,
      description,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    try {
      await dbCreateProject(project);
      setProjects((prev) => [...prev, project]);
      return project;
    } catch (error) {
      console.error('Failed to create project:', error);
      throw error;
    }
  }, []);

  const renameProject = useCallback(async (id: string, name: string) => {
    try {
      const project = projects.find((p) => p.id === id);
      if (!project) return;

      const updated = { ...project, name, updatedAt: new Date() };
      await dbUpdateProject(updated);
      setProjects((prev) => prev.map((p) => (p.id === id ? updated : p)));
    } catch (error) {
      console.error('Failed to rename project:', error);
      throw error;
    }
  }, [projects]);

  const deleteProject = useCallback(async (id: string) => {
    // Don't allow deleting the last project
    if (projects.length <= 1) {
      throw new Error('Cannot delete the last project');
    }

    try {
      await dbDeleteProject(id);
      setProjects((prev) => prev.filter((p) => p.id !== id));

      // If deleting active project, switch to first available
      if (activeProjectId === id) {
        const remaining = projects.filter((p) => p.id !== id);
        if (remaining.length > 0) {
          setActiveProjectId(remaining[0].id);
        }
      }

      // Refresh file counts after deletion
      await refreshFileCounts();
    } catch (error) {
      console.error('Failed to delete project:', error);
      throw error;
    }
  }, [projects, activeProjectId, refreshFileCounts]);

  const selectProject = useCallback((id: string) => {
    setActiveProjectId(id);
  }, []);

  const activeProject = projects.find((p) => p.id === activeProjectId);

  return {
    projects,
    activeProject,
    activeProjectId,
    fileCounts,
    isLoading,
    createProject,
    renameProject,
    deleteProject,
    selectProject,
    refreshFileCounts,
  };
}
