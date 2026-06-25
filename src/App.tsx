import React, { useState, useRef, useEffect } from 'react';
import { UploadCloud, FileType, CheckCircle2, AlertCircle, X, ChevronDown, Download, Share2, History, Sparkles, RefreshCw, Eye, Maximize, User, QrCode, Smartphone, Copy, Check } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { NexusFile, FORMATS, SupportedFormat, AIAnalysisLevel, UserProfile } from './types';
import { getHistory, saveToHistory, clearHistory, formatBytes, generateMockConvertedFile } from './utils';
import { QRCodeSVG } from 'qrcode.react';

export default function App() {
  const [activeTab, setActiveTab] = useState<'convert' | 'analyse' | 'history'>('convert');
  const [files, setFiles] = useState<NexusFile[]>([]);
  const [history, setHistory] = useState<NexusFile[]>([]);
  const [dragActive, setDragActive] = useState(false);
  
  // Modals state
  const [aiPanelOpenFor, setAiPanelOpenFor] = useState<string | null>(null);
  const [previewOpenFor, setPreviewOpenFor] = useState<string | null>(null);
  const [profileOpen, setProfileOpen] = useState(false);
  const [qrOpen, setQrOpen] = useState(false);
  const [customQrUrl, setCustomQrUrl] = useState('');
  
  const [profile, setProfile] = useState<UserProfile>(() => {
    try { return JSON.parse(localStorage.getItem('nexus_profile') || '{}'); } catch { return {}; }
  });

  useEffect(() => {
    setHistory(getHistory());
  }, []);

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setDragActive(true);
    } else if (e.type === "dragleave") {
      setDragActive(false);
    }
  };

  const processFiles = async (newFiles: File[]) => {
    const newNexusFiles: NexusFile[] = await Promise.all(
      newFiles.map(async (file) => {
        // Automatically determine a default target format different from source
        let defaultTarget = 'PDF';
        const ext = file.name.split('.').pop()?.toUpperCase();
        if (ext === 'PDF') defaultTarget = 'ODT';
        if (ext === 'PNG' || ext === 'JPEG') defaultTarget = 'PDF';

        // Read file as data URL to preview/send to AI later
        return new Promise<NexusFile>((resolve) => {
          const reader = new FileReader();
          reader.onloadend = () => {
            resolve({
              id: Math.random().toString(36).substring(7),
              originalName: file.name,
              originalSize: file.size,
              originalType: file.type,
              dataUrl: reader.result as string,
              targetFormat: defaultTarget,
              status: 'idle',
              progress: 0,
              createdAt: Date.now()
            });
          };
          // For simplicity, reading all files as DataURL. In a real app, only do this for small files or specific types.
          reader.readAsDataURL(file);
        });
      })
    );

    setFiles(prev => [...newNexusFiles, ...prev]);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      processFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    e.preventDefault();
    if (e.target.files && e.target.files[0]) {
      processFiles(Array.from(e.target.files));
    }
  };

  const updateFile = (id: string, updates: Partial<NexusFile>) => {
    setFiles(prev => prev.map(f => f.id === id ? { ...f, ...updates } : f));
  };

  const startConversion = async (file: NexusFile) => {
    updateFile(file.id, { status: 'processing', progress: 10 });
    
    // Simulate progress
    const interval = setInterval(() => {
      setFiles(prev => prev.map(f => {
        if (f.id === file.id && f.progress < 90) {
          return { ...f, progress: f.progress + Math.floor(Math.random() * 15) };
        }
        return f;
      }));
    }, 400);

    let completedFile: NexusFile | null = null;

    try {
      const result = await generateMockConvertedFile(
        file,
        file.targetFormat,
        (p: number) => {
          // Progression réelle fournie par PDF.js (pages rendues)
          setFiles(prev => prev.map(f => f.id === file.id ? { ...f, progress: p } : f));
        }
      );
      clearInterval(interval);

      const baseName = file.originalName.substring(0, file.originalName.lastIndexOf('.'));
      // PDF→image : le résultat est un ZIP contenant une image par page
      const ext = result.isZip ? 'zip' : file.targetFormat.toLowerCase();
      const newName = `${baseName}.${ext}`;

      completedFile = {
        ...file,
        status: 'done',
        progress: 100,
        convertedName: newName,
        convertedSize: result.size,
        convertedDataUrl: result.dataUrl
      };
    } catch (e) {
      clearInterval(interval);
      updateFile(file.id, { status: 'error', error: 'Échec de la conversion.' });
      return;
    }

    // Mise à jour du statut en "done" — isolée de localStorage pour qu'une
    // éventuelle erreur de stockage ne puisse jamais écraser ce statut.
    updateFile(file.id, completedFile);

    // Historique : tentative silencieuse (saveToHistory absorbe déjà les exceptions,
    // mais on garde le try/catch ici par sécurité supplémentaire).
    try {
      saveToHistory(completedFile);
      setHistory(getHistory());
    } catch (e) {
      console.warn('[NexusDoc] Historique non enregistré', e);
    }
  };

  const handleDownload = (file: NexusFile) => {
    if (!file.convertedDataUrl || !file.convertedName) return;
    const a = document.createElement('a');
    a.href = file.convertedDataUrl;
    a.download = file.convertedName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  };

  const handleShare = async (file: NexusFile) => {
    if (!file.convertedDataUrl || !file.convertedName) return;
    try {
      // In a real mobile environment, we'd convert dataUrl back to a File to share
      const response = await fetch(file.convertedDataUrl);
      const blob = await response.blob();
      const shareFile = new File([blob], file.convertedName, { type: blob.type });
      
      if (navigator.canShare && navigator.canShare({ files: [shareFile] })) {
        await navigator.share({
          title: file.convertedName,
          files: [shareFile]
        });
      } else {
        alert("Le partage natif n'est pas supporté sur ce navigateur.");
      }
    } catch (err) {
      console.error("Erreur de partage:", err);
    }
  };

  return (
    <div className="min-h-screen pb-20 flex flex-col max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
      {/* Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-white border border-slate-200 z-10 sticky top-4 rounded-3xl shadow-xl shadow-slate-200/50 mb-6">
        <div className="flex items-center gap-3 cursor-pointer" onClick={() => setActiveTab('convert')}>
          <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 to-violet-500 rounded-lg flex items-center justify-center shadow-lg shadow-cyan-200 overflow-hidden">
            {profile.avatarUrl ? (
              <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" />
            ) : (
              <div className="w-4 h-4 border-2 border-white rounded-sm"></div>
            )}
          </div>
          <h1 className="text-xl font-black tracking-tighter text-slate-900 uppercase">Nexus·Doc</h1>
        </div>
        <div className="flex bg-slate-100 p-1 rounded-full overflow-x-auto hide-scrollbar">
          <button 
            onClick={() => setActiveTab('convert')}
            className={`px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-colors whitespace-nowrap ${activeTab === 'convert' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Convertir
          </button>
          <button 
            onClick={() => setActiveTab('analyse')}
            className={`px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-colors whitespace-nowrap ${activeTab === 'analyse' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Analyse IA
          </button>
          <button 
            onClick={() => setActiveTab('history')}
            className={`px-3 sm:px-4 py-1.5 text-xs font-bold uppercase tracking-wider rounded-full transition-colors whitespace-nowrap ${activeTab === 'history' ? 'bg-slate-900 text-white shadow-lg' : 'text-slate-500 hover:text-slate-700'}`}
          >
            Historique
          </button>
        </div>
        <div className="flex items-center gap-1 sm:gap-2">
          <button onClick={() => setQrOpen(true)} className="p-2 text-slate-900 hover:text-cyan-500 hover:bg-slate-100 rounded-full transition-colors" title="Transfert QR">
            <UploadCloud className="w-5 h-5" />
          </button>
          <button onClick={() => {
            navigator.clipboard.writeText(window.location.href.replace('ais-dev-', 'ais-pre-'));
            alert('Lien PWA copié !');
          }} className="p-2 text-slate-900 hover:text-cyan-500 hover:bg-slate-100 rounded-full transition-colors" title="Copier lien PWA">
            <Smartphone className="w-5 h-5" />
          </button>
          <button onClick={() => setProfileOpen(true)} className="p-2 text-slate-900 hover:text-violet-500 hover:bg-slate-100 rounded-full transition-colors" title="Profil">
            <User className="w-5 h-5" />
          </button>
        </div>
      </header>

      <main className="flex-1 flex flex-col gap-6">
        {(activeTab === 'convert' || activeTab === 'analyse') && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-6 w-full max-w-xl mx-auto">
            
            {/* Dropzone */}
            <div 
              className={`relative overflow-hidden rounded-3xl border-2 border-dashed transition-all duration-300 ${dragActive ? 'border-cyan-400 bg-cyan-50/50 scale-[1.02]' : 'border-cyan-200 bg-cyan-50/30 hover:bg-cyan-50'} flex flex-col items-center justify-center p-12 text-center cursor-pointer shadow-sm z-10 bg-white`}
              onDragEnter={handleDrag}
              onDragLeave={handleDrag}
              onDragOver={handleDrag}
              onDrop={handleDrop}
            >
              <input 
                type="file" 
                multiple 
                onChange={handleChange} 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-20"
              />
              <div className="w-16 h-16 rounded-full bg-white shadow-md flex items-center justify-center mb-4 text-slate-400 border border-slate-100">
                <UploadCloud className={`w-8 h-8 ${dragActive ? 'text-cyan-500' : 'text-slate-400'}`} />
              </div>
              <h3 className="text-lg font-bold text-slate-800 mb-2">
                {activeTab === 'analyse' ? 'Déposez vos fichiers à analyser' : 'Déposez vos fichiers ici'}
              </h3>
              <p className="text-sm text-slate-500 max-w-[250px] font-medium">Touchez pour parcourir ou glissez-déposez n'importe quel document.</p>
            </div>

            {/* Empty State Illustrations */}
            {files.length === 0 && (
              <div className="flex justify-center mt-2 pointer-events-none px-4">
                {activeTab === 'convert' ? (
                  <img src="/accueil.png" alt="Accueil" className="w-full max-w-[500px] h-auto object-contain drop-shadow-2xl opacity-90" onError={(e) => e.currentTarget.style.display = 'none'} />
                ) : (
                  <img src="/formats.png" alt="Formats supportés" className="w-full max-w-[400px] h-auto object-contain drop-shadow-xl" onError={(e) => e.currentTarget.style.display = 'none'} />
                )}
              </div>
            )}

            {/* Active Queue */}
            <AnimatePresence>
              {files.map((file) => (
                <FileItem 
                  key={file.id} 
                  file={file} 
                  updateFile={updateFile} 
                  startConversion={startConversion}
                  onRemove={() => setFiles(prev => prev.filter(f => f.id !== file.id))}
                  onOpenAI={() => setAiPanelOpenFor(file.id)}
                  onPreview={() => setPreviewOpenFor(file.id)}
                  onDownload={() => handleDownload(file)}
                  onShare={() => handleShare(file)}
                  isAnalyseTab={activeTab === 'analyse'}
                />
              ))}
            </AnimatePresence>

          </motion.div>
        )}

        {activeTab === 'history' && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col gap-4 w-full max-w-xl mx-auto h-full flex-1">
            <div className="flex items-center justify-between mb-2">
              <h2 className="text-sm font-bold text-slate-400 uppercase tracking-widest">Historique Récent</h2>
              {history.length > 0 && (
                <button 
                  onClick={() => {
                    if (window.confirm("Voulez-vous vraiment supprimer tout l'historique ?")) {
                      clearHistory();
                      setHistory([]);
                    }
                  }}
                  className="text-xs text-red-500 hover:text-red-600 font-bold uppercase tracking-wider bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors"
                >
                  Tout effacer
                </button>
              )}
            </div>
            
            {history.length === 0 ? (
              <div className="text-center p-8 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col items-center flex-1 relative overflow-hidden">
                {/* Background image / pattern */}
                <div className="absolute inset-0 opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, #000 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-slate-50 rounded-full blur-3xl opacity-50"></div>
                
                <div className="relative z-10 flex flex-col items-center justify-center h-full w-full">
                  <div className="w-24 h-24 bg-white border-[3px] border-black rounded-2xl flex items-center justify-center mb-6 shadow-sm overflow-hidden cursor-pointer" onClick={() => setActiveTab('history')}>
                    <img 
                      src="/history-logo.png" 
                      alt="Logo Historique" 
                      className="w-full h-full object-cover"
                      onError={(e) => { 
                        e.currentTarget.style.display = 'none'; 
                        e.currentTarget.nextElementSibling?.classList.remove('hidden');
                      }}
                    />
                    <History className="hidden fallback-icon w-10 h-10 text-slate-800" />
                  </div>
                  <h3 className="text-lg font-bold text-slate-700 mb-2">C'est bien vide ici</h3>
                  <p className="text-sm font-medium text-slate-400 max-w-[250px]">Vos fichiers convertis et analysés apparaîtront dans cet historique.</p>
                </div>
              </div>
            ) : (
              <div className="flex flex-col gap-3">
                {history.map((file) => (
                  <div key={file.id} className="bg-slate-900 rounded-3xl p-4 shadow-xl flex items-center justify-between border border-slate-800">
                    <div className="flex items-center gap-4 overflow-hidden">
                      <div className="w-10 h-10 rounded-lg bg-slate-800 flex items-center justify-center shrink-0">
                        <CheckCircle2 className="w-5 h-5 text-cyan-400" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-bold text-white truncate text-sm">{file.convertedName}</h4>
                        <p className="text-xs text-slate-400 mt-0.5">{formatBytes(file.convertedSize || 0)} • de {file.originalName.split('.').pop()?.toUpperCase()}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => setPreviewOpenFor(file.id)} className="p-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-full transition-colors">
                        <Eye className="w-4 h-4" />
                      </button>
                      <button onClick={() => setAiPanelOpenFor(file.id)} className="p-2 text-violet-400 hover:text-violet-300 hover:bg-slate-800 rounded-full transition-colors">
                        <Sparkles className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDownload(file)} className="p-2 text-cyan-400 hover:text-cyan-300 hover:bg-slate-800 rounded-full transition-colors">
                        <Download className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}
      </main>

      {/* AI Analysis Panel Drawer */}
      <AnimatePresence>
        {aiPanelOpenFor && (
          <AIAnalysisPanel 
            file={files.find(f => f.id === aiPanelOpenFor) || history.find(f => f.id === aiPanelOpenFor)!} 
            onClose={() => setAiPanelOpenFor(null)}
          />
        )}
      </AnimatePresence>

      {/* Preview Panel Modal */}
      <AnimatePresence>
        {previewOpenFor && (
          <PreviewPanel 
            file={files.find(f => f.id === previewOpenFor) || history.find(f => f.id === previewOpenFor)!} 
            onClose={() => setPreviewOpenFor(null)} 
          />
        )}
      </AnimatePresence>
      {/* Profile Modal */}
      <AnimatePresence>
        {profileOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm border border-slate-100"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-bold text-slate-900 uppercase tracking-widest text-sm">Profil</h3>
                <button onClick={() => setProfileOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <div className="flex flex-col gap-4">
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Prénom / Nom</label>
                  <input type="text" value={profile.name || ''} onChange={e => {
                    const updated = { ...profile, name: e.target.value };
                    setProfile(updated);
                    localStorage.setItem('nexus_profile', JSON.stringify(updated));
                  }} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Âge</label>
                  <input type="text" value={profile.age || ''} onChange={e => {
                    const updated = { ...profile, age: e.target.value };
                    setProfile(updated);
                    localStorage.setItem('nexus_profile', JSON.stringify(updated));
                  }} className="w-full mt-1 px-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-sm outline-none focus:border-cyan-400" />
                </div>
                <div>
                  <label className="text-xs font-bold text-slate-400 uppercase">Avatar (Optionnel)</label>
                  <div className="mt-1 flex items-center gap-4">
                    <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center overflow-hidden border border-slate-200 shrink-0">
                      {profile.avatarUrl ? <img src={profile.avatarUrl} alt="Avatar" className="w-full h-full object-cover" /> : <User className="w-8 h-8 text-slate-300" />}
                    </div>
                    <label className="cursor-pointer py-2 px-4 bg-cyan-50 text-cyan-600 rounded-xl text-xs font-bold uppercase tracking-wider hover:bg-cyan-100 transition-colors">
                      Changer
                      <input type="file" accept="image/*" className="hidden" onChange={e => {
                        if (e.target.files && e.target.files[0]) {
                          const reader = new FileReader();
                          reader.onloadend = () => {
                            const updated = { ...profile, avatarUrl: reader.result as string };
                            setProfile(updated);
                            localStorage.setItem('nexus_profile', JSON.stringify(updated));
                          };
                          reader.readAsDataURL(e.target.files[0]);
                        }
                      }} />
                    </label>
                  </div>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* QR Code Modal for Phone Transfer */}
      <AnimatePresence>
        {qrOpen && (
          <motion.div 
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex items-center justify-center p-4"
          >
            <motion.div 
              initial={{ scale: 0.9, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0.9, opacity: 0 }}
              className="bg-white rounded-3xl shadow-2xl p-6 w-full max-w-sm border border-slate-100 flex flex-col items-center"
            >
              <div className="w-full flex justify-between items-center mb-6">
                <div className="flex items-center gap-2 text-slate-900">
                  <Smartphone className="w-5 h-5 text-violet-500" />
                  <h3 className="font-bold uppercase tracking-widest text-sm">Continuer sur Mobile</h3>
                </div>
                <button onClick={() => setQrOpen(false)} className="p-2 text-slate-400 hover:bg-slate-100 rounded-full">
                  <X className="w-5 h-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500 text-center mb-6 font-medium">
                Pour utiliser l'application sur votre téléphone, cliquez sur le bouton <strong>Share</strong> (en haut à droite), copiez le lien généré, et collez-le ci-dessous.
              </p>
              <div className="w-full mb-6">
                 <input 
                   type="text" 
                   placeholder="Collez le lien partagé ici..." 
                   value={customQrUrl}
                   onChange={(e) => setCustomQrUrl(e.target.value)}
                   className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 text-sm font-mono text-slate-700 outline-none focus:border-cyan-500 transition-colors placeholder:font-sans" 
                 />
              </div>
              <div className="p-4 bg-white rounded-2xl shadow-sm border border-slate-100 mb-4 flex justify-center">
                <QRCodeSVG value={customQrUrl || 'https://ai.studio'} size={200} fgColor={customQrUrl ? "#0f172a" : "#cbd5e1"} />
              </div>
              {!customQrUrl && (
                <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 text-center font-medium">
                  ⚠️ En attente du lien. Le QR code ci-dessus est inactif pour le moment.
                </p>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// -----------------------------------------------------------------------------
// FILE ITEM COMPONENT
// -----------------------------------------------------------------------------
interface FileItemProps {
  file: NexusFile; 
  updateFile: (id: string, updates: Partial<NexusFile>) => void;
  startConversion: (file: NexusFile) => void;
  onRemove: () => void;
  onOpenAI: () => void;
  onPreview: () => void;
  onDownload: () => void;
  onShare: () => void;
  isAnalyseTab?: boolean;
}

const FileItem: React.FC<FileItemProps> = ({ 
  file, 
  updateFile, 
  startConversion, 
  onRemove, 
  onOpenAI,
  onPreview,
  onDownload,
  onShare,
  isAnalyseTab
}) => {
  const isDone = file.status === 'done';
  const isProcessing = file.status === 'processing';

  return (
    <motion.div 
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.95, height: 0, marginBottom: 0 }}
      className="bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 overflow-hidden flex flex-col mb-4"
    >
      <div className="p-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4 overflow-hidden flex-1">
          <div className={`w-12 h-12 rounded-full flex items-center justify-center shrink-0 shadow-md ${isDone ? 'bg-cyan-50' : 'bg-slate-50'}`}>
            {isDone ? <CheckCircle2 className="w-6 h-6 text-cyan-500" /> : <FileType className="w-6 h-6 text-cyan-400" />}
          </div>
          <div className="min-w-0 flex-1">
            <h4 className="font-bold text-slate-700 truncate text-sm">
              {isDone ? file.convertedName : file.originalName}
            </h4>
            <p className="text-xs text-slate-400 mt-1 font-medium">
              {isDone ? `${formatBytes(file.convertedSize || 0)} • Prêt` : formatBytes(file.originalSize)}
            </p>
          </div>
        </div>

        {!isProcessing && !isDone && (
          <button onClick={onRemove} className="p-2 text-slate-300 hover:text-red-500 hover:bg-red-50 rounded-full transition-colors shrink-0">
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Progress Bar */}
      {(isProcessing || isDone) && (
        <div className="h-1.5 w-full bg-slate-100 relative overflow-hidden">
          <motion.div 
            className="absolute left-0 top-0 h-full bg-nexus-gradient shadow-[0_0_10px_rgba(34,211,238,0.5)]"
            initial={{ width: 0 }}
            animate={{ width: `${file.progress}%` }}
            transition={{ ease: "linear", duration: 0.2 }}
          />
        </div>
      )}

      <div className="px-6 py-4 bg-slate-50 border-t border-slate-100 flex flex-col gap-4">
        {!isDone ? (
          isAnalyseTab ? (
            <button 
              onClick={onOpenAI}
              className="w-full py-4 bg-violet-50 text-violet-600 rounded-2xl text-sm font-black uppercase tracking-widest flex items-center justify-center gap-2 hover:bg-violet-100 transition-colors"
            >
              <Sparkles className="w-5 h-5" />
              Analyser ce document
            </button>
          ) : (
            <>
              <div className="flex flex-col gap-2">
                <label className="text-[10px] font-bold text-slate-400 uppercase">Vers format cible</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {FORMATS.slice(0, 4).map(f => (
                    <button 
                      key={f}
                      onClick={() => updateFile(file.id, { targetFormat: f })}
                      disabled={isProcessing}
                      className={`py-2 px-3 rounded-xl text-xs font-bold transition-all ${file.targetFormat === f ? 'bg-slate-900 text-white shadow-lg shadow-slate-400/20' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'} disabled:opacity-50`}
                    >
                      {f}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <span className="text-xs font-bold text-slate-400 uppercase">Ou un autre :</span>
                  <div className="relative flex-1">
                    <select 
                      value={file.targetFormat}
                      onChange={(e) => updateFile(file.id, { targetFormat: e.target.value })}
                      disabled={isProcessing}
                      className="appearance-none bg-white border border-slate-200 rounded-xl py-2 pl-3 pr-8 text-xs font-bold text-slate-600 focus:outline-none focus:border-cyan-400 disabled:opacity-50 w-full"
                    >
                      {FORMATS.map(f => <option key={f} value={f}>{f}</option>)}
                    </select>
                    <ChevronDown className="w-4 h-4 text-slate-400 absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>
              <button 
                onClick={() => startConversion(file)}
                disabled={isProcessing}
                className="w-full mt-2 py-4 bg-gradient-to-r from-cyan-400 to-violet-500 text-white rounded-2xl text-sm font-black uppercase tracking-widest shadow-xl shadow-cyan-400/20 active:scale-95 transition-transform disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {isProcessing ? (
                  <>
                    <RefreshCw className="w-5 h-5 animate-spin" />
                    Conversion...
                  </>
                ) : 'Convertir Maintenant'}
              </button>
            </>
          )
        ) : (
          <div className="flex flex-col gap-4">
             <div className="flex items-center gap-4">
                <button 
                  onClick={onOpenAI}
                  className="flex-1 py-3 bg-violet-50 border border-violet-100 text-violet-600 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider hover:bg-violet-100 transition-colors"
                >
                  <Sparkles className="w-4 h-4" />
                  Analyser IA
                </button>
                <button 
                  onClick={onPreview}
                  className="flex-1 py-3 bg-cyan-50 border border-cyan-100 text-cyan-600 rounded-2xl flex items-center justify-center gap-2 font-bold text-xs uppercase tracking-wider hover:bg-cyan-100 transition-colors"
                >
                  <Eye className="w-4 h-4" />
                  Aperçu
                </button>
             </div>
             <div className="flex gap-4">
                <button onClick={onDownload} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-700 transition-colors font-bold text-xs uppercase tracking-wider">
                  <Download className="w-4 h-4 text-cyan-500" /> Enregistrer
                </button>
                <button onClick={onShare} className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 rounded-2xl flex items-center justify-center gap-2 text-slate-700 transition-colors font-bold text-xs uppercase tracking-wider">
                  <Share2 className="w-4 h-4 text-violet-500" /> Partager
                </button>
             </div>
          </div>
        )}
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// AI ANALYSIS PANEL
// -----------------------------------------------------------------------------
function AIAnalysisPanel({ file, onClose }: { file: NexusFile, onClose: () => void }) {
  const [loading, setLoading] = useState(false);
  const [level, setLevel] = useState<AIAnalysisLevel>('court');
  const [action, setAction] = useState<'Résumer' | 'Extraire' | 'Vérifier' | 'Reformuler'>('Résumer');
  const [result, setResult] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    if (result) {
      navigator.clipboard.writeText(result);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const runAnalysis = async (customAction?: string) => {
    setLoading(true);
    setResult(null);

    const currentAction = customAction || action;
    const isImage = file.originalType?.startsWith('image/');

    const textPrompt = `Tu es NEXUS·DOC, un assistant documentaire expert.
Action demandée : ${currentAction}
Niveau de détail : ${level === 'court' ? 'Court — synthèse concise en 3-5 points maximum' : 'Détaillé — analyse approfondie avec exemples et explications'}

Règles :
- Répondre en français, ton clair et professionnel.
- Ne pas inventer d'information absente du document.
- Structurer la réponse avec des titres clairs (Synthèse, Points clés, Points d'attention…).
- Si c'est une image, décrire son contenu visible avant d'analyser.

Document : ${file.originalName}${file.convertedName ? ` → ${file.convertedName}` : ''}`;

    try {
      const res = await fetch('/api/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          prompt: textPrompt,
          fileData: file.dataUrl,
          mimeType: file.originalType
        })
      });

      const data = await res.json();
      if (data.error) throw new Error(data.error);
      
      setResult(data.result);
    } catch (e: any) {
      setResult(`Erreur lors de l'analyse : ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div 
      initial={{ y: '100%' }}
      animate={{ y: 0 }}
      exit={{ y: '100%' }}
      transition={{ type: 'spring', damping: 25, stiffness: 200 }}
      className="fixed inset-x-0 bottom-0 z-50 h-[85vh] bg-white rounded-t-[2rem] shadow-[0_-20px_50px_rgba(0,0,0,0.15)] flex flex-col border-t border-slate-100 max-w-4xl mx-auto"
    >
      <div className="flex items-center justify-between p-6 border-b border-slate-100">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 bg-gradient-to-tr from-cyan-400 to-violet-500 rounded flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-white" />
          </div>
          <h3 className="text-xs font-bold text-slate-900 uppercase tracking-widest">Nexus·IA Analyste</h3>
        </div>
        <button onClick={onClose} className="p-2 bg-slate-100 rounded-full text-slate-500 hover:bg-slate-200">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-6 bg-gradient-to-br from-slate-50 via-white to-slate-100 flex flex-col gap-6">
        {/* Document Info */}
        <div className="bg-white p-4 rounded-2xl shadow-xl shadow-slate-200/50 border border-slate-100 flex items-center gap-4">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100">
            <FileType className="w-6 h-6 text-slate-400" />
          </div>
          <div className="min-w-0">
            <p className="text-[10px] text-cyan-600 font-bold uppercase tracking-widest mb-1">Document source</p>
            <p className="text-sm text-slate-900 font-bold truncate">{file.convertedName || file.originalName}</p>
          </div>
        </div>

        {/* Controls */}
        <div className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 flex flex-col gap-6">
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Que voulez-vous faire ?</p>
            <div className="grid grid-cols-2 gap-2">
              {['Résumer', 'Comparer', 'Extraire', 'Reformuler'].map(act => (
                <button 
                  key={act}
                  onClick={() => setAction(act as any)}
                  className={`py-3 px-4 rounded-xl text-xs font-bold transition-all ${action === act ? 'bg-slate-900 text-white shadow-lg shadow-slate-400/20' : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'}`}
                >
                  {act}
                </button>
              ))}
            </div>
          </div>
          
          <div>
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-3">Niveau de détail</p>
            <div className="flex bg-slate-100 p-1 rounded-xl">
              <button 
                onClick={() => setLevel('court')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${level === 'court' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                Court
              </button>
              <button 
                onClick={() => setLevel('detaillé')}
                className={`flex-1 py-2 text-xs font-bold rounded-lg transition-colors ${level === 'detaillé' ? 'bg-white shadow text-slate-900' : 'text-slate-500'}`}
              >
                Détaillé
              </button>
            </div>
          </div>

          <button 
            onClick={() => runAnalysis()}
            disabled={loading}
            className="w-full py-4 rounded-2xl bg-gradient-to-r from-cyan-400 to-violet-500 text-white text-sm font-black uppercase tracking-widest shadow-xl shadow-cyan-400/20 flex items-center justify-center gap-2 transition-transform active:scale-95 disabled:opacity-70"
          >
            {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <Sparkles className="w-5 h-5" />}
            {loading ? 'Analyse en cours...' : 'Lancer l\'analyse'}
          </button>
        </div>

        {/* Result Area */}
        <AnimatePresence>
          {result && (
            <motion.div 
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
              className="bg-white p-6 rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 relative group"
            >
              <button 
                onClick={handleCopy}
                className="absolute top-4 right-4 p-2 bg-slate-100 hover:bg-slate-200 rounded-lg text-slate-500 transition-colors flex items-center gap-2"
                title="Copier le texte"
              >
                {copied ? <Check className="w-4 h-4 text-green-500" /> : <Copy className="w-4 h-4" />}
                <span className="text-[10px] font-bold uppercase tracking-wider">{copied ? 'Copié' : 'Copier'}</span>
              </button>
              <div className="prose prose-sm max-w-none text-slate-700 whitespace-pre-wrap font-roboto font-bold mt-8">
                {result}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

// -----------------------------------------------------------------------------
// PREVIEW PANEL
// -----------------------------------------------------------------------------
function PreviewPanel({ file, onClose }: { file: NexusFile, onClose: () => void }) {
  const [view, setView] = useState<'source' | 'converted'>('converted');

  const isSourceImage = file.originalType?.startsWith('image/');

  return (
    <motion.div 
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-md flex flex-col p-4 sm:p-6"
    >
      <div className="bg-white rounded-3xl shadow-2xl flex-1 flex flex-col overflow-hidden max-w-5xl mx-auto w-full border border-slate-100">
        <div className="flex items-center justify-between p-6 border-b border-slate-100 bg-slate-50/50">
          <div className="flex items-center gap-4 min-w-0">
            <div className="w-12 h-12 rounded-xl bg-cyan-50 flex items-center justify-center shrink-0 border border-cyan-100">
              <Eye className="w-6 h-6 text-cyan-500" />
            </div>
            <div className="min-w-0 flex-1">
              <h3 className="font-black text-slate-900 uppercase tracking-widest text-xs mb-1">Prévisualisation</h3>
              <p className="text-sm text-slate-500 font-medium truncate">{view === 'source' ? file.originalName : file.convertedName}</p>
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex bg-slate-200/50 p-1 rounded-xl">
              <button 
                onClick={() => setView('source')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${view === 'source' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Source
              </button>
              <button 
                onClick={() => setView('converted')}
                className={`px-4 py-2 text-xs font-bold rounded-lg transition-colors ${view === 'converted' ? 'bg-white shadow-md text-slate-900' : 'text-slate-500 hover:text-slate-700'}`}
              >
                Converti
              </button>
            </div>
            <button onClick={onClose} className="w-10 h-10 bg-slate-100 rounded-full flex items-center justify-center text-slate-500 hover:bg-slate-200 hover:text-slate-700 transition-colors shrink-0">
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        <div className="flex-1 bg-slate-100 relative overflow-hidden flex items-center justify-center">
            {view === 'source' ? (
              isSourceImage && file.dataUrl ? (
                <img src={file.dataUrl} alt="Source" className="max-w-full max-h-full object-contain p-8 drop-shadow-xl" />
              ) : (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center text-slate-500">
                  <FileType className="w-20 h-20 text-slate-300 mb-6" />
                  <p className="font-medium">Aperçu du format source non supporté pour {file.originalType}</p>
                  <p className="text-sm mt-2 text-slate-400">Le fichier fait {formatBytes(file.originalSize)}</p>
                </div>
              )
            ) : (
              <div className="flex-1 flex flex-col items-center justify-center p-8 text-center relative w-full h-full overflow-y-auto">
                <div className="max-w-2xl w-full mx-auto my-auto space-y-6">
                  <div className="bg-white p-10 rounded-[2rem] shadow-2xl text-left border border-slate-100">
                    <h4 className="font-black text-slate-900 uppercase tracking-widest text-xs border-b border-slate-100 pb-4 mb-6">Contenu Généré (Simulation)</h4>
                    <p className="text-sm text-slate-600 leading-relaxed font-mono bg-slate-50 p-6 rounded-2xl border border-slate-100">
                      <span className="text-cyan-600 font-bold">[Document {file.targetFormat}]</span><br/><br/>
                      Nom original : <span className="text-slate-900">{file.originalName}</span><br/>
                      Type cible : <span className="text-slate-900">{file.targetFormat}</span><br/>
                      Taille cible : <span className="text-slate-900">{formatBytes(file.convertedSize || 0)}</span><br/><br/>
                      <span className="text-slate-400">Cette vue montre le document après conversion. Dans une implémentation backend complète, l'aperçu réel du PDF, DOCX ou image serait rendu ici.</span>
                    </p>
                  </div>
                </div>
              </div>
            )}
        </div>
      </div>
    </motion.div>
  );
}
