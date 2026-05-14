import localforage from 'localforage';
import { v4 as uuidv4 } from 'uuid';

export interface VisualManual {
  style_name: string;
  style_summary: string;
  optimized_prompt: string;
  environment_variables: Record<string, string>;
  composition: Record<string, string>;
}

export interface SavedManual extends VisualManual {
  id: string;
  createdAt: number;
}

export interface ChatTurn {
  id: string;
  role: 'user' | 'assistant';
  content?: string;
  images?: { mimeType: string; data: string; url?: string }[]; // url is only for active session
  results?: VisualManual[];
  createdAt: number;
}

export interface Project {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  history: ChatTurn[];
}

const projectsStore = localforage.createInstance({
  name: 'PromptCraft',
  storeName: 'projects'
});

export const getProjects = async (): Promise<Project[]> => {
  const projects: Project[] = [];
  await projectsStore.iterate((value: Project) => {
    projects.push(value);
  });
  return projects.sort((a, b) => b.updatedAt - a.updatedAt);
};

export const getProject = async (id: string): Promise<Project | null> => {
  return await projectsStore.getItem<Project>(id);
};

export const saveProject = async (project: Project): Promise<void> => {
  project.updatedAt = Date.now();
  await projectsStore.setItem(project.id, project);
};

export const deleteProject = async (id: string): Promise<void> => {
  await projectsStore.removeItem(id);
};

export const createProject = async (): Promise<Project> => {
  const p: Project = {
    id: uuidv4(),
    name: 'New Project',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    history: []
  };
  await saveProject(p);
  return p;
};
