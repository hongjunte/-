import React, { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Upload, X, Copy, Check, Sparkles, FileJson, Save, Bookmark, Trash2, Library, BookOpen, Plus, MessageSquare, Menu, LayoutGrid } from 'lucide-react';
import { GoogleGenAI } from '@google/genai';
import { v4 as uuidv4 } from 'uuid';
import { 
  Project, 
  VisualManual, 
  SavedManual, 
  ChatTurn, 
  getProjects, 
  createProject, 
  saveProject, 
  deleteProject 
} from './storage';

// --- API Logic ---
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

const fileToBase64 = (file: File): Promise<{ mimeType: string; data: string; url: string }> => {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      const [header, base64] = result.split(',');
      const mimeType = header.match(/:(.*?);/)[1];
      resolve({ mimeType, data: base64, url: URL.createObjectURL(file) });
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
};

const generateVariations = async (currentImages: { mimeType: string, data: string }[], idea: string, history: ChatTurn[]): Promise<VisualManual[]> => {
  const parts: any[] = [];
  
  let historyContext = "";
  if (history && history.length > 0) {
    historyContext = history.map(t => {
      if (t.role === 'user') return `User Input: ${t.content || '(no text, images only)'}`;
      else return `Assistant Output Generated Styles: ${t.results?.map(r => r.style_name).join(', ')}`;
    }).join('\n');
    historyContext = `\n--- Previous Chat History ---\n${historyContext}\n-----------------------------\n`;
  }

  for (const img of currentImages) {
    parts.push({
      inlineData: { mimeType: img.mimeType, data: img.data }
    });
  }

  const promptText = `Analyze the provided reference images and the user's conceptual idea: "${idea || 'Create a visually stunning and cohesive variation based on these images'}".
You act as an elite Art Director and Prompt Engineer. 

CRITICAL DIRECTIVE - 100% EXACT STYLE, COLOR, AND LIGHTING CLONING:
The user wants to use your output in an image generator (like Nano Banano, Midjourney, etc.) to create NEW images that have the EXACT SAME ARTISTIC STYLE, COLOR GRADING, LIGHTING, CONTRAST, AND BRIGHTNESS as the reference image. Even though the subject matter might change across the 5 variations, the visual signature MUST match perfectly (1:1 style clone). Lighting and color are the MOST important elements!

Your task is to deconstruct the image into a "Visual Recipe" that forces an AI generator to reproduce the look perfectly.${historyContext}

1. Master Style Extraction: Identify the precise medium/render engine (e.g., Octane Render, 35mm film, oil impasto, flat vector, risograph).
2. Color & Brightness: Identify the exact color cast, temperature (warm/cool), brightness levels (high-key, low-key, mid-tone overexposed), exposure, and contrast (e.g., cyan/orange cinematic, pastel flat matte, high contrast neon, soft muted palette).
3. Lighting Setup: Identify the specific lighting setup (e.g., harsh rim lighting, soft volumetric fog, ambient occlusion, global illumination, direct sunlight, dappled shadows, studio bounce light). Describe the shadow density and highlights.
4. Specific Artwork & Artist References: Deeply analyze the style and explicitly name the precise artists, directors, studios, or specific masterpiece artworks that perfectly match this aesthetic (e.g., "in the style of Spirited Away by Studio Ghibli", "cinematography by Roger Deakins in Blade Runner 2049", "oil painting style of The Starry Night by Vincent van Gogh").
5. Explicit Instructions: Your generated prompts MUST explicitly include strong directives like: "in the exact style of the reference image", "matching the specific style of [Artist/Artwork]", "maintaining the exact same color palette, lighting, exposure, and contrast of the reference".
6. Content Variations: Keep the hardcore style identical, but slightly vary the subjects, environments, or actions to give the user 5 distinct options.

Your output JSON structure MUST perfectly match the TypeScript interface below, representing an Array of exactly 5 variation objects. Do not wrap in markdown loops.

JSON Structure Example (Follow keys strictly, make values extremely descriptive):
[
  {
    "style_name": "Plush City Festival Mobile Poster",
    "style_summary": "A bright mobile event poster combining city landmarks and soft fuzzy mascot characters...",
    "optimized_prompt": "A highly descriptive, massive comma-separated prompt string ready to copy/paste into an image generator. MUST BE FORMATTED LIKE THIS: 'A [subject/scene], perfectly replicating the exact artistic style of the reference image. Masterpiece in the specific style of [Exact Artist/Studio/Artwork]. Features identical [specific color palette: e.g., muted pastel pinks and deep olive greens], [exact lighting setup: e.g., soft diffused volumetric lighting with harsh rim light], [exact exposure/brightness], and [specific medium].' Include all composition details.",
    "environment_variables": {
      "EXACT_COLOR_PALETTE_AND_BRIGHTNESS": "Specific colors, hue, saturation, overall image brightness, and exposure level",
      "LIGHTING_AND_SHADOWS": "Direction, softness, light source types, bounce light, shadow depth/darkness",
      "RENDERING_OR_MEDIUM": "If 3D: render engine, raytracing. If 2D: brush style. If photo: camera/lens/film stock.",
      "MATERIAL_PROPERTIES": "Textures, surface reflectiveness, gloss vs matte",
      "SUBJECT_MATTER": "The actual varying content for this specific variation",
      "SPECIFIC_ARTWORK_AND_ARTIST_REFERENCE": "Precise names of artists, specific artworks, studios, or exact aesthetic genres that act directly as a visual anchor"
    },
    "composition": {
      "camera_lens_and_framing": "e.g., 50mm lens, eye-level, wide shot",
      "layout_and_perspective": "e.g., isometric, rule of thirds, forced perspective",
      "object_placement": "Where objects sit in the frame"
    }
  }
]

ONLY return a JSON Array of exactly 5 objects. Make the values incredibly specific.`;

  parts.push({ text: promptText });

  const response = await ai.models.generateContent({
    model: "gemini-3.1-pro-preview",
    contents: { parts },
    config: {
      responseMimeType: "application/json"
    }
  });

  if (!response.text) throw new Error("No response generated.");
  let jsonText = response.text;
  if (jsonText.startsWith('```')) {
    jsonText = jsonText.replace(/^```(json)?\n/, '');
    jsonText = jsonText.replace(/\n```$/, '');
  }
  return JSON.parse(jsonText);
};


function ResultsGrid({ results, savedManuals, saveManual }: { results: VisualManual[], savedManuals: SavedManual[], saveManual: (m: VisualManual) => void }) {
  return (
    <motion.div 
      initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
      className="grid grid-cols-1 md:grid-cols-2 gap-4 auto-rows-auto"
    >
      {results.map((result, idx) => {
        const isSaved = savedManuals.some(m => m.style_name === result.style_name && JSON.stringify(m.composition) === JSON.stringify(result.composition));
        
        if (idx === 0) {
          return (
            <div key={idx} className="md:col-span-2 bg-white rounded-2xl p-6 shadow-sm border border-[#E5E5E7] flex flex-col justify-between space-y-4">
              <div>
                <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center text-xs font-bold text-[#1D1D1F]">V{idx + 1}</div>
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#1D1D1F]">{result.style_name}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => saveManual(result)}
                        className={`text-[10px] px-3 py-1.5 rounded-full font-bold uppercase transition-colors flex items-center space-x-1 ${isSaved ? 'bg-indigo-100 text-indigo-700' : 'bg-neutral-100 text-neutral-700 hover:bg-neutral-200'}`}
                      >
                        <Bookmark size={12} className={isSaved ? 'fill-current' : ''} />
                        <span>{isSaved ? 'Saved' : 'Save to Library'}</span>
                      </button>
                      <button
                        onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                        className="text-[10px] bg-green-100 text-green-700 px-3 py-1.5 rounded-full font-bold uppercase hover:bg-green-200 transition-colors flex items-center space-x-1"
                      >
                        <Copy size={12} />
                        <span>Copy JSON</span>
                      </button>
                    </div>
                </div>
                
                <p className="text-sm text-[#1D1D1F] mb-4">{result.style_summary}</p>
                
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {Object.entries(result.composition).slice(0, 4).map(([key, value], i) => (
                    <div key={i} className="p-3 bg-[#FBFBFD] rounded-lg border border-[#F0F0F2] overflow-hidden">
                      <div className="text-[9px] text-[#86868B] uppercase mb-1 font-bold truncate">{key.replace(/_/g, ' ')}</div>
                      <div className="text-xs font-medium text-[#1D1D1F] truncate" title={value as string}>{value as string}</div>
                    </div>
                  ))}
                </div>
              </div>
              
              {result.optimized_prompt && (
                <div className="mt-4 p-4 bg-[#F5F5F7] rounded-xl border border-[#D2D2D7]">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-[10px] uppercase font-bold text-[#86868B]">Optimized Generator Prompt</span>
                    <button
                      onClick={() => navigator.clipboard.writeText(result.optimized_prompt!)}
                      className="text-[10px] bg-blue-100 text-blue-700 px-2 py-1 rounded font-bold uppercase hover:bg-blue-200 transition-colors flex items-center space-x-1"
                    >
                      <Copy size={10} />
                      <span>Copy Prompt</span>
                    </button>
                  </div>
                  <p className="text-xs text-[#1D1D1F] font-mono leading-relaxed line-clamp-3" title={result.optimized_prompt}>
                    {result.optimized_prompt}
                  </p>
                </div>
              )}
              
              <div className="mt-2 p-4 bg-[#1D1D1F] rounded-xl font-mono text-[11px] text-[#A1A1A6] leading-relaxed h-32 overflow-y-auto">
                <pre className="whitespace-pre-wrap break-words">
                  {JSON.stringify(result.environment_variables, null, 2)}
                </pre>
              </div>
            </div>
          );
        }
        
        return (
          <div key={idx} className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E5E7] flex flex-col h-full justify-between gap-4">
            <div>
              <div className="flex justify-between items-start mb-3">
                <div className="w-8 h-8 rounded-full bg-[#E5E5E7] flex items-center justify-center text-xs font-bold text-[#1D1D1F]">V{idx + 1}</div>
                <div className="flex gap-2">
                  <button 
                    onClick={() => saveManual(result)}
                    className={`p-1.5 rounded-full hover:bg-neutral-100 transition-colors ${isSaved ? 'text-indigo-600' : 'text-neutral-400'}`}
                    title="Save to Library"
                  >
                    <Bookmark size={14} className={isSaved ? 'fill-current' : ''}/>
                  </button>
                  <button 
                    onClick={() => navigator.clipboard.writeText(JSON.stringify(result, null, 2))}
                    className="p-1.5 text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                    title="Copy JSON"
                  >
                      <Copy size={14} />
                  </button>
                </div>
              </div>
              <h3 className="text-sm font-semibold mb-1 text-[#1D1D1F] line-clamp-1" title={result.style_name}>{result.style_name}</h3>
              <p className="text-[11px] text-[#86868B] line-clamp-2" title={result.style_summary}>{result.style_summary}</p>
            </div>
            
            <div className="p-3 bg-[#FBFBFD] rounded-lg border border-[#F0F0F2] flex-1 max-h-32 overflow-hidden relative">
                <div className="absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[#FBFBFD] to-transparent pointer-events-none"></div>
                <div className="font-mono text-[9px] text-[#86868B] whitespace-pre-wrap break-words">
                  {result.optimized_prompt ? (
                    <div>
                      <div className="flex justify-between items-center mb-1">
                        <span className="font-bold text-black">Prompt</span>
                        <button onClick={() => navigator.clipboard.writeText(result.optimized_prompt!)} className="text-blue-600 hover:underline">Copy</button>
                      </div>
                      {result.optimized_prompt}
                    </div>
                  ) : (
                    JSON.stringify(result.environment_variables, null, 2)
                  )}
                </div>
            </div>
          </div>
        );
      })}
    </motion.div>
  );
}


export default function App() {
  const [activeTab, setActiveTab] = useState<'create' | 'library'>('create');
  
  // Storage & Project State
  const [projects, setProjects] = useState<Project[]>([]);
  const [currentProjectId, setCurrentProjectId] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);

  // Input State (per turn)
  const [images, setImages] = useState<{ file: File; url: string; mimeType: string; data: string }[]>([]);
  const [idea, setIdea] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  const scrollRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Load Library & Projects
  const [savedManuals, setSavedManuals] = useState<SavedManual[]>(() => {
    try {
      const saved = localStorage.getItem('promptcraft_library');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });

  useEffect(() => {
    localStorage.setItem('promptcraft_library', JSON.stringify(savedManuals));
  }, [savedManuals]);

  useEffect(() => {
    getProjects().then(projs => {
      setProjects(projs);
      if (projs.length > 0) {
        setCurrentProjectId(projs[0].id);
      } else {
        handleNewProject();
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Scroll to bottom when history changes
  const currentProject = projects.find(p => p.id === currentProjectId);
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [currentProject?.history, isGenerating]);

  useEffect(() => {
    return () => {
      images.forEach(img => URL.revokeObjectURL(img.url));
    };
  }, [images]);

  const handleNewProject = async () => {
    const newProj = await createProject();
    setProjects(prev => [newProj, ...prev]);
    setCurrentProjectId(newProj.id);
    setActiveTab('create');
    setImages([]);
    setIdea("");
  };

  const switchProject = (id: string) => {
    setCurrentProjectId(id);
    setActiveTab('create');
    setImages([]);
    setIdea("");
  };

  const deleteProj = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    await deleteProject(id);
    setProjects(prev => {
      const updated = prev.filter(p => p.id !== id);
      if (updated.length > 0 && currentProjectId === id) {
        setCurrentProjectId(updated[0].id);
      } else if (updated.length === 0) {
        handleNewProject();
      }
      return updated;
    });
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files) return;
    
    const imageFiles = Array.from(files).filter(file => file.type.startsWith('image/'));
    const processPromises = imageFiles.map(async file => {
      const b64 = await fileToBase64(file);
      return { file, ...b64 };
    });
    
    const newImages = await Promise.all(processPromises);
    setImages(prev => [...prev, ...newImages]);
  };

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); };
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    handleFiles(e.dataTransfer.files);
  };
  const removeImage = (index: number) => {
    setImages(prev => {
      const newImages = [...prev];
      URL.revokeObjectURL(newImages[index].url);
      newImages.splice(index, 1);
      return newImages;
    });
  };

  const handleGenerate = async () => {
    if (images.length === 0 && idea.trim() === "") {
      setError("Please upload images or write a prompt.");
      return;
    }
    const curProj = projects.find(p => p.id === currentProjectId);
    if (!curProj) return;

    setIsGenerating(true);
    setError(null);

    // Prepare Turn
    const userTurn: ChatTurn = {
      id: uuidv4(),
      role: 'user',
      content: idea,
      images: images.map(i => ({ mimeType: i.mimeType, data: i.data, url: i.url })),
      createdAt: Date.now()
    };
    
    // Auto-update project name if it's the first non-empty input
    let projName = curProj.name;
    if (curProj.history.length === 0 && idea) {
      projName = idea.slice(0, 30) + (idea.length > 30 ? '...' : '');
    }

    const updatedProj = { ...curProj, name: projName, history: [...curProj.history, userTurn] };
    
    setProjects(prev => prev.map(p => p.id === updatedProj.id ? updatedProj : p));
    await saveProject(updatedProj);
    
    const currentIdea = idea;
    setImages([]); 
    setIdea("");

    try {
      const formattedResults = await generateVariations(
        userTurn.images || [], 
        currentIdea, 
        curProj.history // past history provides context
      );
      
      const assistantTurn: ChatTurn = {
        id: uuidv4(),
        role: 'assistant',
        results: formattedResults,
        createdAt: Date.now()
      };
      
      const finalProj = {
        ...updatedProj,
        history: [...updatedProj.history, assistantTurn]
      };
      setProjects(prev => prev.map(p => p.id === finalProj.id ? finalProj : p));
      await saveProject(finalProj);
      
    } catch (err: any) {
      console.error(err);
      const errorMessage = typeof err === 'string' ? err : (err?.message || JSON.stringify(err));
      
      if (errorMessage.includes("429") || errorMessage.includes("exceeded") || errorMessage.includes("RESOURCE_EXHAUSTED") || errorMessage.includes("quota")) {
        setError("You have exceeded your AI model's API quota. Please check your billing details or rate limits.");
      } else {
        setError(errorMessage || "An error occurred while generating variations.");
      }
      
      // Remove the user turn on failure to not pollute state, or keep it. Let's keep it but show global error on bottom left.
    } finally {
      setIsGenerating(false);
    }
  };

  const saveManual = (manual: VisualManual) => {
    if (savedManuals.some(m => m.style_name === manual.style_name && JSON.stringify(m.composition) === JSON.stringify(manual.composition))) return;
    const newManual: SavedManual = {
      ...manual,
      id: Math.random().toString(36).substring(2, 9),
      createdAt: Date.now()
    };
    setSavedManuals(prev => [newManual, ...prev]);
  };

  const removeSavedManual = (id: string) => {
    setSavedManuals(prev => prev.filter(m => m.id !== id));
  };

  return (
    <div className="flex h-screen bg-[#F5F5F7] text-[#1D1D1F] font-sans overflow-hidden">
      
      {/* Sidebar */}
      <AnimatePresence>
        {sidebarOpen && (
          <motion.aside
            initial={{ width: 0, opacity: 0 }}
            animate={{ width: 260, opacity: 1 }}
            exit={{ width: 0, opacity: 0 }}
            className="bg-white border-r border-[#D2D2D7] flex flex-col shrink-0 z-40 overflow-hidden"
          >
            <div className="h-16 px-4 flex items-center border-b border-[#D2D2D7]">
              <div className="w-8 h-8 bg-gradient-to-tr from-blue-600 to-indigo-400 rounded-lg flex items-center justify-center shrink-0">
                <div className="w-4 h-4 bg-white rounded-sm rotate-45 animate-pulse"></div>
              </div>
              <span className="text-xl font-semibold tracking-tight ml-3 truncate">PromptCraft</span>
            </div>
            
            <div className="p-4">
              <button 
                onClick={handleNewProject}
                className="w-full py-2.5 bg-[#F2F2F7] hover:bg-[#E5E5E7] text-[#1D1D1F] rounded-lg font-medium text-sm flex items-center justify-center gap-2 transition-colors"
              >
                <Plus size={16} /> New Project
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-2 space-y-1">
              <div className="px-3 mb-2 mt-2 text-[10px] font-bold text-[#86868B] uppercase tracking-wider">Recent Projects</div>
              {projects.map(proj => (
                <div 
                  key={proj.id}
                  onClick={() => switchProject(proj.id)}
                  className={`w-full text-left px-3 py-2 rounded-lg text-sm flex items-center justify-between cursor-pointer group transition-colors ${proj.id === currentProjectId ? 'bg-blue-50 text-blue-700 font-medium' : 'text-[#424245] hover:bg-[#F2F2F7]'}`}
                >
                  <div className="flex items-center gap-2 truncate pr-2">
                    <MessageSquare size={14} className={`${proj.id === currentProjectId ? 'text-blue-500' : 'text-[#86868B]'}`} />
                    <span className="truncate">{proj.name}</span>
                  </div>
                  <button 
                    onClick={(e) => deleteProj(proj.id, e)}
                    className="opacity-0 group-hover:opacity-100 p-1 hover:bg-neutral-200 rounded text-red-500 transition-opacity"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>

            <div className="p-4 border-t border-[#D2D2D7]">
              <button 
                onClick={() => setActiveTab('create')} 
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors mb-1 ${activeTab === 'create' ? 'bg-[#1D1D1F] text-white font-medium' : 'text-[#424245] hover:bg-[#F2F2F7]'}`}
              >
                <LayoutGrid size={16} /> <span>Workspace</span>
              </button>
              <button 
                onClick={() => setActiveTab('library')} 
                className={`w-full text-left px-3 py-2.5 rounded-lg text-sm flex items-center gap-3 transition-colors ${activeTab === 'library' ? 'bg-[#1D1D1F] text-white font-medium' : 'text-[#424245] hover:bg-[#F2F2F7]'}`}
              >
                <Library size={16} /> <span>Library</span> 
                {savedManuals.length > 0 && <span className={`ml-auto text-[10px] py-0.5 px-2 rounded-full ${activeTab === 'library' ? 'bg-white/20 text-white' : 'bg-neutral-200 text-neutral-600'}`}>{savedManuals.length}</span>}
              </button>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <div className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-16 px-4 md:px-6 flex shrink-0 items-center justify-between border-b border-[#D2D2D7] bg-white/80 backdrop-blur-md sticky top-0 z-10">
          <div className="flex items-center gap-4">
            <button onClick={() => setSidebarOpen(!sidebarOpen)} className="p-2 -ml-2 rounded-lg hover:bg-[#F2F2F7] text-[#1D1D1F] transition-colors">
              <Menu size={20} />
            </button>
            <h1 className="text-lg font-semibold">{activeTab === 'create' ? currentProject?.name || 'Workspace' : 'Saved Library'}</h1>
          </div>
          <div className="flex items-center gap-4">
             <div className="px-3 py-1 bg-[#F2F2F7] rounded-full text-[11px] font-medium text-[#1D1D1F] hidden sm:block">Model: gemini-3.1-pro-preview</div>
          </div>
        </header>

        {/* Main Area */}
        <main className="flex-1 overflow-hidden relative">
          <AnimatePresence mode="wait">
            {activeTab === 'create' && currentProject && (
              <motion.div 
                key="create"
                initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
                className="grid grid-cols-1 lg:grid-cols-12 gap-0 lg:gap-6 h-full p-4 md:p-6 pb-2"
              >
                {/* Input Panel (Left) */}
                <div className="lg:col-span-4 flex flex-col gap-6 h-full pb-4">
                  <div className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E5E7] flex flex-col h-full overflow-hidden">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <h2 className="text-sm font-semibold uppercase tracking-wider text-[#86868B]">Source Assets</h2>
                      {images.length > 0 && (
                        <button onClick={() => setImages([])} className="text-blue-600 text-xs font-semibold hover:underline">Clear All</button>
                      )}
                    </div>
                    
                    <div className="overflow-y-auto flex-1 pb-4 flex flex-col gap-4">
                      {/* Multi-Image Upload Area */}
                      <div 
                        className={`grid grid-cols-2 gap-3 transition-all duration-300 ${images.length === 0 ? 'flex-1 min-h-[120px]' : ''}`}
                        onDragOver={onDragOver}
                        onDrop={onDrop}
                      >
                        {images.map((img, idx) => (
                          <div key={img.url} className="aspect-square rounded-xl overflow-hidden shadow-sm relative group bg-slate-200">
                            <div className="absolute inset-0 bg-gradient-to-b from-transparent to-black/40 z-10 pointer-events-none"></div>
                            <img src={img.url} className="w-full h-full object-cover relative z-0" alt="upload" />
                            <div className="absolute bottom-2 left-2 text-[10px] text-white font-medium z-10">{idx === 0 ? 'Main Ref' : `Ref ${idx + 1}`}</div>
                            <button 
                              onClick={(e) => { e.stopPropagation(); removeImage(idx); }}
                              className="absolute top-2 right-2 p-1.5 z-20 bg-black/40 backdrop-blur-md rounded-full text-white opacity-0 group-hover:opacity-100 transition-opacity hover:bg-black/60"
                            >
                              <X size={14} />
                            </button>
                          </div>
                        ))}
                        
                        <div 
                          onClick={() => fileInputRef.current?.click()}
                          className={`aspect-square rounded-xl bg-[#F5F5F7] border-2 border-dashed border-[#D2D2D7] flex flex-col items-center justify-center gap-2 cursor-pointer hover:border-blue-400 hover:bg-blue-50/50 transition-colors ${images.length === 0 ? 'col-span-2' : ''}`}
                        >
                          <input type="file" ref={fileInputRef} onChange={(e) => handleFiles(e.target.files)} multiple accept="image/*" className="hidden" />
                          <Upload className="w-6 h-6 text-[#86868B]" />
                          <span className="text-[10px] text-[#86868B] font-medium">{images.length === 0 ? 'Drop images or click' : 'Add Info'}</span>
                        </div>
                      </div>

                      {/* Prompt Input */}
                      <div className="flex flex-col gap-2 mt-auto shrink-0">
                        <label className="text-[11px] font-bold text-[#1D1D1F] uppercase mt-2">Instruction / Continuation</label>
                        <textarea
                          value={idea}
                          onChange={(e) => setIdea(e.target.value)}
                          className="w-full min-h-[100px] p-3 bg-[#F5F5F7] rounded-xl border border-transparent text-sm placeholder:text-[#86868B] focus:border-[#D2D2D7] focus:bg-white focus:outline-none focus:ring-4 focus:ring-blue-500/10 resize-none transition-all" 
                          placeholder="E.g. Create a visual manual, OR type 'Give me 5 more variations with a darker mood'..."
                        />
                      </div>
                    </div>

                    <div className="shrink-0 mt-4 pt-4 border-t border-[#F0F0F2]">
                      <button 
                        onClick={handleGenerate}
                        disabled={isGenerating || (images.length === 0 && idea.trim() === '')}
                        className={`w-full py-3.5 text-white rounded-xl font-medium shadow-sm transition-all flex items-center justify-center space-x-2
                          ${(isGenerating || (images.length === 0 && idea.trim() === ''))
                            ? 'bg-neutral-300 shadow-none cursor-not-allowed text-neutral-500'
                            : 'bg-[#1D1D1F] hover:bg-black active:scale-[0.98]'}`}
                      >
                        {isGenerating ? (
                          <>
                            <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></div>
                            <span>Analyzing...</span>
                          </>
                        ) : (
                          <>
                            <Sparkles size={16} />
                            <span>{currentProject.history.length > 0 ? "Generate Additions" : "Generate Manual"}</span>
                          </>
                        )}
                      </button>
                      {error && (
                        <div className="p-3 bg-red-50 text-red-600 rounded-lg text-xs border border-red-100 mt-3">
                          {error}
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                {/* Output Panel (Right) - Chat Feed */}
                <div className="lg:col-span-8 flex flex-col h-full bg-white rounded-2xl border border-[#E5E5E7] shadow-sm relative overflow-hidden">
                  <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-8" ref={scrollRef}>
                    {currentProject.history.length === 0 && !isGenerating && (
                      <div className="h-full flex flex-col items-center justify-center text-center max-w-sm mx-auto">
                        <div className="w-16 h-16 bg-neutral-100 rounded-2xl flex items-center justify-center text-neutral-400 mx-auto mb-5 border border-neutral-200 shadow-sm">
                          <FileJson size={32} />
                        </div>
                        <h3 className="text-xl text-[#1D1D1F] font-semibold tracking-tight mb-2">Ready for Instructions</h3>
                        <p className="text-sm text-[#86868B] leading-relaxed">Upload reference assets on the left and specify your intent. It will deconstruct the aesthetics into structured JSON palettes.</p>
                      </div>
                    )}

                    {currentProject.history.map((turn, idx) => (
                      <div key={turn.id} className="w-full flex flex-col">
                        {turn.role === 'user' ? (
                           <div className="self-end max-w-[85%]">
                              <div className="flex gap-2 items-end justify-end mb-1 text-[10px] text-[#86868B] font-medium">You</div>
                              <div className="bg-[#F2F2F7] rounded-2xl rounded-tr-sm p-4 text-[#1D1D1F] inline-block shadow-sm float-right border border-[#E5E5E7]">
                                {turn.images && turn.images.length > 0 && (
                                  <div className="flex gap-2 flex-wrap mb-2">
                                    {turn.images.map((img, i) => (
                                      <img key={i} src={img.url || `data:${img.mimeType};base64,${img.data}`} className="w-16 h-16 md:w-20 md:h-20 object-cover rounded-lg border border-black/10" alt="ref" />
                                    ))}
                                  </div>
                                )}
                                {turn.content && <div className="text-[13px] md:text-sm whitespace-pre-wrap">{turn.content}</div>}
                              </div>
                           </div>
                        ) : (
                          <div className="self-start w-full">
                            <div className="flex gap-2 items-center mb-3">
                               <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-indigo-400 rounded-md flex items-center justify-center shrink-0 shadow-sm">
                                  <Sparkles className="text-white w-3 h-3" />
                               </div>
                               <div className="text-xs font-bold text-[#1D1D1F]">Engine V2.1</div>
                            </div>
                            <div className="w-full">
                               {turn.results && <ResultsGrid results={turn.results} savedManuals={savedManuals} saveManual={saveManual} />}
                            </div>
                          </div>
                        )}
                      </div>
                    ))}

                    {isGenerating && (
                      <div className="self-start w-full opacity-70">
                         <div className="flex gap-2 items-center mb-3">
                            <div className="w-6 h-6 bg-gradient-to-tr from-blue-600 to-indigo-400 rounded-md flex items-center justify-center shrink-0 shadow-sm blur-[1px]">
                               <Sparkles className="text-white w-3 h-3 animate-pulse" />
                            </div>
                            <div className="text-xs font-bold text-[#1D1D1F]">Generating Variables...</div>
                         </div>
                         <div className="h-32 bg-[#F5F5F7] rounded-2xl animate-pulse"></div>
                      </div>
                    )}
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'library' && (
              <motion.div 
                key="library"
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -10 }}
                className="flex flex-col gap-6 p-4 md:p-8 overflow-y-auto h-full"
              >
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-semibold tracking-tight">Your Library</h1>
                    <p className="text-sm text-[#86868B] mt-1">Saved instruction sets and visual manuals across all projects.</p>
                  </div>
                  {savedManuals.length > 0 && (
                    <button onClick={() => setSavedManuals([])} className="px-4 py-2 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors">Clear Library</button>
                  )}
                </div>

                {savedManuals.length === 0 ? (
                  <div className="flex flex-col items-center justify-center p-16 mt-8 bg-white rounded-3xl border border-[#E5E5E7] shadow-sm">
                    <div className="w-20 h-20 bg-neutral-100 rounded-3xl flex items-center justify-center text-neutral-300 mx-auto mb-6">
                      <BookOpen size={40} />
                    </div>
                    <h3 className="text-xl font-semibold text-[#1D1D1F] mb-3">Library is empty</h3>
                    <p className="text-[#86868B] text-[15px] text-center max-w-md leading-relaxed">
                      You haven't saved any visual manuals yet. Go to your Workspace, generate some variations, and click the Save icon to keep your favorites here.
                    </p>
                    <button 
                      onClick={() => setActiveTab('create')}
                      className="mt-8 px-8 py-3 bg-[#1D1D1F] text-white rounded-xl text-sm font-semibold hover:bg-black transition-all shadow-md active:scale-95"
                    >
                      Return to Workspace
                    </button>
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
                    {savedManuals.map(manual => (
                      <div key={manual.id} className="bg-white rounded-2xl p-5 shadow-sm border border-[#E5E5E7] flex flex-col gap-4">
                        <div className="flex justify-between items-start">
                          <h3 className="text-sm font-semibold text-[#1D1D1F] line-clamp-2 pr-4 leading-snug">{manual.style_name}</h3>
                          <div className="flex items-center gap-1 shrink-0 -mt-1 -mr-1">
                            <button 
                              onClick={() => navigator.clipboard.writeText(JSON.stringify(manual, null, 2))}
                              className="p-2 text-blue-600 rounded-full hover:bg-blue-50 transition-colors"
                              title="Copy JSON"
                            >
                              <Copy size={16} />
                            </button>
                            <button 
                              onClick={() => removeSavedManual(manual.id)}
                              className="p-2 text-red-500 rounded-full hover:bg-red-50 transition-colors"
                              title="Remove from library"
                            >
                              <Trash2 size={16} />
                            </button>
                          </div>
                        </div>
                        
                        <p className="text-[11px] text-[#86868B] line-clamp-3 leading-relaxed">{manual.style_summary}</p>
                        
                        <div className="p-4 bg-[#FBFBFD] rounded-xl border border-[#F0F0F2] flex-1 max-h-48 overflow-y-auto mt-2">
                          <div className="font-mono text-[10px] text-[#86868B] whitespace-pre-wrap break-words">
                            {manual.optimized_prompt ? (
                              <div>
                                <div className="flex justify-between items-center mb-2">
                                  <span className="font-bold text-black uppercase">Generator Prompt</span>
                                  <button onClick={() => navigator.clipboard.writeText(manual.optimized_prompt!)} className="text-blue-600 hover:underline">Copy Prompt</button>
                                </div>
                                {manual.optimized_prompt}
                              </div>
                            ) : (
                              JSON.stringify(manual.environment_variables, null, 2)
                            )}
                          </div>
                        </div>
                        <div className="text-[10px] text-[#A1A1A6] font-medium text-right mt-1">
                          Added {new Date(manual.createdAt).toLocaleDateString()}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </motion.div>
            )}
          </AnimatePresence>
        </main>
      </div>
    </div>
  );
}
