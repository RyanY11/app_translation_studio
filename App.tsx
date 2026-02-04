import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Upload, Download, Globe, Image as ImageIcon, Search, Save, Trash2, X, Plus, ChevronLeft, ChevronRight, ArrowDownToLine } from 'lucide-react';
import { Button } from './components/Button';
import { parseTsFile, generateTsFile, flattenSection, unflattenData } from './services/parser';
import { SectionData, ParsedFile, FileMetadata } from './types';

function App() {
  const [zhFile, setZhFile] = useState<File | null>(null);
  const [enFile, setEnFile] = useState<File | null>(null);
  const [sections, setSections] = useState<SectionData[]>([]);
  const [selectedSectionId, setSelectedSectionId] = useState<string | null>(null);
  const [fileMeta, setFileMeta] = useState<FileMetadata | null>(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  
  // Screenshot Carousel State
  const [activeScreenshotIndex, setActiveScreenshotIndex] = useState(0);
  const [isLightboxOpen, setIsLightboxOpen] = useState(false);
  const touchStartX = useRef<number | null>(null);

  // Refs for auto-scrolling or focus if needed, mostly for file inputs
  const zhInputRef = useRef<HTMLInputElement>(null);
  const enInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);

  // Derived State (Moved up to be accessible by handlers)
  const activeSection = sections.find(s => s.id === selectedSectionId);
  const filteredItems = activeSection?.items.filter(item => 
    item.key.toLowerCase().includes(searchQuery.toLowerCase()) || 
    item.zh.includes(searchQuery) || 
    item.en.includes(searchQuery)
  );

  const stats = sections.reduce((acc, curr) => {
      acc.total += curr.items.length;
      acc.translated += curr.items.filter(i => i.en).length;
      return acc;
  }, { total: 0, translated: 0 });

  // Reset active screenshot when section changes
  useEffect(() => {
    setActiveScreenshotIndex(0);
  }, [selectedSectionId]);

  const handleFileUpload = async () => {
    if (!zhFile || !enFile) return;

    setIsProcessing(true);
    try {
      const zhParsed = await parseTsFile(zhFile);
      const enParsed = await parseTsFile(enFile);

      setFileMeta({
        zhPrefix: zhParsed.prefix,
        zhSuffix: zhParsed.suffix,
        enPrefix: enParsed.prefix,
        enSuffix: enParsed.suffix,
      });

      // Merge data: Iterate over ZH keys (Master) and find matching EN keys
      const zhContent = zhParsed.content;
      const enContent = enParsed.content;
      
      const newSections: SectionData[] = [];

      Object.keys(zhContent).forEach(topKey => {
        const zhFlat = flattenSection(topKey, zhContent[topKey]);
        const enFlat = flattenSection(topKey, enContent[topKey] || {}); // Handle missing sections in EN

        // Create a map for EN values for quick lookup
        const enMap = new Map(enFlat.map(i => [i.localKey, i.value]));

        const items = zhFlat.map(item => ({
          key: `${topKey}.${item.localKey}`,
          localKey: item.localKey,
          zh: item.value,
          en: enMap.get(item.localKey) || '' // Empty if missing in EN
        }));

        newSections.push({
          id: topKey,
          items,
          screenshots: []
        });
      });

      setSections(newSections);
      if (newSections.length > 0) {
        setSelectedSectionId(newSections[0].id);
      }

    } catch (error) {
      alert("Error parsing files: " + (error as Error).message);
    } finally {
      setIsProcessing(false);
    }
  };

  const handleExport = () => {
    if (!fileMeta) return;

    // Reconstruct the objects
    const zhRoot: Record<string, any> = {};
    const enRoot: Record<string, any> = {};

    sections.forEach(section => {
      // Re-inflate ZH
      const zhItems = section.items.map(i => ({ localKey: i.localKey, value: i.zh }));
      zhRoot[section.id] = unflattenData(zhItems);

      // Re-inflate EN
      const enItems = section.items.map(i => ({ localKey: i.localKey, value: i.en }));
      enRoot[section.id] = unflattenData(enItems);
    });

    // Generate strings
    const zhOutput = generateTsFile(zhRoot, fileMeta.zhPrefix, fileMeta.zhSuffix);
    const enOutput = generateTsFile(enRoot, fileMeta.enPrefix, fileMeta.enSuffix);

    // Generate filename with date
    const now = new Date();
    const yyyy = now.getFullYear();
    const mm = String(now.getMonth() + 1).padStart(2, '0');
    const dd = String(now.getDate()).padStart(2, '0');
    const dateStr = `${yyyy}${mm}${dd}`;

    // Helper download function
    const download = (filename: string, content: string) => {
      const blob = new Blob([content], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
    };

    download(`zh_${dateStr}.ts`, zhOutput);
    download(`en_${dateStr}.ts`, enOutput);
  };

  const handleUpdateItem = (sectionId: string, itemKey: string, field: 'zh' | 'en', value: string) => {
    setSections(prev => prev.map(sec => {
      if (sec.id !== sectionId) return sec;
      return {
        ...sec,
        items: sec.items.map(item => item.key === itemKey ? { ...item, [field]: value } : item)
      };
    }));
  };

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0 && selectedSectionId) {
      Array.from(files).forEach(file => {
          const reader = new FileReader();
          reader.onload = (ev) => {
            const result = ev.target?.result as string;
            setSections(prev => prev.map(sec => 
              sec.id === selectedSectionId ? { ...sec, screenshots: [...(sec.screenshots || []), result] } : sec
            ));
          };
          reader.readAsDataURL(file);
      });
    }
    // Reset input
    if (imageInputRef.current) imageInputRef.current.value = '';
  };

  const handleRemoveScreenshot = (indexToRemove: number) => {
    if (selectedSectionId) {
       setSections(prev => prev.map(sec => 
          sec.id === selectedSectionId ? { 
              ...sec, 
              screenshots: sec.screenshots.filter((_, idx) => idx !== indexToRemove) 
          } : sec
        ));
        
        // Adjust index if we deleted the current or a previous image
        if (indexToRemove < activeScreenshotIndex) {
            setActiveScreenshotIndex(prev => Math.max(0, prev - 1));
        } else if (indexToRemove === activeScreenshotIndex) {
            // If deleting current, show previous, or 0 if empty
            setActiveScreenshotIndex(prev => Math.max(0, prev - 1));
        }
    }
  };

  const handleFindNextEmpty = () => {
    if (!filteredItems) return;
    
    // Find the first item where English is empty or just whitespace
    const emptyItem = filteredItems.find(item => !item.en || item.en.trim() === '');
    
    if (emptyItem) {
        const elementId = `input-en-${emptyItem.key}`;
        const element = document.getElementById(elementId);
        if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'center' });
            element.focus();
        }
    } else {
        alert("Great job! No empty translations found in this list.");
    }
  };

  // Carousel Navigation
  const nextImage = useCallback(() => {
    if (activeSection && activeSection.screenshots.length > 0) {
        setActiveScreenshotIndex((prev) => (prev + 1) % activeSection.screenshots.length);
    }
  }, [activeSection]);

  const prevImage = useCallback(() => {
    if (activeSection && activeSection.screenshots.length > 0) {
        setActiveScreenshotIndex((prev) => (prev - 1 + activeSection.screenshots.length) % activeSection.screenshots.length);
    }
  }, [activeSection]);

  const handleTouchStart = (e: React.TouchEvent) => {
      touchStartX.current = e.touches[0].clientX;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
      if (!touchStartX.current) return;
      const touchEndX = e.changedTouches[0].clientX;
      const diff = touchStartX.current - touchEndX;

      if (Math.abs(diff) > 50) { // Threshold
          if (diff > 0) nextImage(); // Swipe Left -> Next
          else prevImage(); // Swipe Right -> Prev
      }
      touchStartX.current = null;
  };

  // Keyboard navigation for Lightbox
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        if (!isLightboxOpen) return;
        if (e.key === 'Escape') setIsLightboxOpen(false);
        if (e.key === 'ArrowLeft') prevImage();
        if (e.key === 'ArrowRight') nextImage();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLightboxOpen, prevImage, nextImage]);

  // Initial Upload Screen
  if (sections.length === 0) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="bg-white p-8 rounded-2xl shadow-xl max-w-2xl w-full border border-slate-200">
          <div className="text-center mb-8">
            <div className="w-16 h-16 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <Globe size={32} />
            </div>
            <h1 className="text-3xl font-bold text-slate-800">App Internationalization Manager</h1>
            <p className="text-slate-500 mt-2">Upload your TypeScript localization files to start editing.</p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div 
              onClick={() => zhInputRef.current?.click()}
              className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${zhFile ? 'border-blue-500 bg-blue-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
            >
              <input ref={zhInputRef} type="file" accept=".ts,.js,.json" className="hidden" onChange={(e) => setZhFile(e.target.files?.[0] || null)} />
              <div className="font-semibold text-lg mb-1">{zhFile ? zhFile.name : 'Upload Chinese (.ts)'}</div>
              <p className="text-xs text-slate-400">Source Language</p>
            </div>

            <div 
               onClick={() => enInputRef.current?.click()}
               className={`border-2 border-dashed rounded-xl p-6 text-center cursor-pointer transition-all ${enFile ? 'border-purple-500 bg-purple-50' : 'border-slate-300 hover:border-slate-400 hover:bg-slate-50'}`}
            >
              <input ref={enInputRef} type="file" accept=".ts,.js,.json" className="hidden" onChange={(e) => setEnFile(e.target.files?.[0] || null)} />
              <div className="font-semibold text-lg mb-1">{enFile ? enFile.name : 'Upload English (.ts)'}</div>
              <p className="text-xs text-slate-400">Target Language</p>
            </div>
          </div>

          <Button 
            onClick={handleFileUpload} 
            disabled={!zhFile || !enFile || isProcessing} 
            className="w-full h-12 text-lg"
          >
            {isProcessing ? 'Parsing Files...' : 'Start Editing'}
          </Button>
        </div>
      </div>
    );
  }

  // Ensure active index is safe
  const currentScreenshot = activeSection?.screenshots?.[activeScreenshotIndex];
  const hasScreenshots = activeSection && activeSection.screenshots.length > 0;

  // Main Editor Workspace
  return (
    <div className="flex flex-col h-screen">
      {/* Header */}
      <header className="bg-white border-b border-slate-200 px-6 py-3 flex items-center justify-between shrink-0 z-10">
        <div className="flex items-center gap-3">
            <div className="bg-blue-600 text-white p-2 rounded-lg">
                <Globe size={20} />
            </div>
            <div>
                <h1 className="font-bold text-slate-800">I18n Master Studio</h1>
                <p className="text-xs text-slate-500">
                    {stats.translated} / {stats.total} translated ({Math.round(stats.translated/stats.total*100)}%)
                </p>
            </div>
        </div>
        <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => window.location.reload()} size="sm">New Project</Button>
            <Button onClick={handleExport} icon={<Download size={18} />}>Export Files</Button>
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-64 bg-slate-100 border-r border-slate-200 overflow-y-auto shrink-0 flex flex-col">
            <div className="p-4 font-semibold text-slate-500 text-sm uppercase tracking-wider sticky top-0 bg-slate-100 z-10">
                Pages / Sections
            </div>
            <div className="px-2 pb-4 space-y-1">
                {sections.map(section => {
                    const progress = Math.round((section.items.filter(i => i.en).length / section.items.length) * 100);
                    return (
                        <button
                            key={section.id}
                            onClick={() => setSelectedSectionId(section.id)}
                            className={`w-full text-left px-3 py-2 rounded-md text-sm flex items-center justify-between group ${selectedSectionId === section.id ? 'bg-white shadow-sm text-blue-600 font-medium' : 'text-slate-600 hover:bg-slate-200'}`}
                        >
                            <span className="truncate">{section.id}</span>
                            <span className={`text-xs px-1.5 py-0.5 rounded-full ${progress === 100 ? 'bg-green-100 text-green-700' : 'bg-slate-200 text-slate-500'}`}>
                                {progress}%
                            </span>
                        </button>
                    );
                })}
            </div>
        </aside>

        {/* Main Content */}
        <main className="flex-1 flex overflow-hidden">
            {/* Translations List */}
            <div className="flex-1 overflow-y-auto p-6 min-w-0 bg-white">
                <div className="flex items-center justify-between mb-6 sticky top-0 bg-white/95 backdrop-blur-sm z-10 py-2 border-b border-slate-100">
                    <h2 className="text-xl font-bold text-slate-800">{activeSection?.id}</h2>
                    <div className="flex items-center gap-2">
                        <div className="relative">
                            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
                            <input 
                                type="text" 
                                placeholder="Search keys..." 
                                className="pl-9 pr-4 py-1.5 border border-slate-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 w-64"
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                            />
                        </div>
                        <Button 
                            variant="secondary" 
                            size="sm" 
                            icon={<ArrowDownToLine size={14} />} 
                            onClick={handleFindNextEmpty}
                            title="Scroll to next empty English field"
                        >
                           Next Empty
                        </Button>
                    </div>
                </div>

                <div className="space-y-6">
                    {filteredItems?.map((item) => (
                        <div key={item.key} className="grid grid-cols-1 lg:grid-cols-2 gap-4 pb-6 border-b border-slate-100 last:border-0">
                            <div className="space-y-1">
                                <label className="block text-xs font-semibold text-slate-400 uppercase font-mono">{item.localKey}</label>
                                <textarea
                                    className="w-full p-3 bg-slate-50 border border-slate-200 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-500 min-h-[80px]"
                                    value={item.zh}
                                    onChange={(e) => handleUpdateItem(activeSection!.id, item.key, 'zh', e.target.value)}
                                    placeholder="Chinese text..."
                                />
                            </div>
                            <div className="space-y-1 relative group">
                                <label className="block text-xs font-semibold text-purple-400 uppercase flex justify-between">
                                    <span>English</span>
                                </label>
                                <textarea
                                    id={`input-en-${item.key}`}
                                    className={`w-full p-3 bg-white border rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 min-h-[80px] ${!item.en ? 'border-red-200 bg-red-50/30' : 'border-slate-200'}`}
                                    value={item.en}
                                    onChange={(e) => handleUpdateItem(activeSection!.id, item.key, 'en', e.target.value)}
                                    placeholder="English translation..."
                                />
                            </div>
                        </div>
                    ))}
                    {filteredItems?.length === 0 && (
                        <div className="text-center py-12 text-slate-400">
                            No items found matching your search.
                        </div>
                    )}
                </div>
            </div>

            {/* Screenshot Panel */}
            <div className="w-96 border-l border-slate-200 bg-slate-50 p-6 overflow-hidden shrink-0 flex flex-col">
                 <h3 className="font-semibold text-slate-700 mb-4 flex items-center gap-2 shrink-0">
                    <ImageIcon size={18} /> Context ({activeSection?.screenshots.length || 0})
                 </h3>
                 
                 <input ref={imageInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleImageUpload} />

                 {hasScreenshots ? (
                     <div className="flex-1 flex flex-col min-h-0 gap-4">
                        {/* Main Stage */}
                        <div 
                            className="flex-1 relative bg-slate-100 rounded-xl overflow-hidden border border-slate-200 group flex items-center justify-center cursor-zoom-in"
                            onTouchStart={handleTouchStart}
                            onTouchEnd={handleTouchEnd}
                            onClick={() => setIsLightboxOpen(true)}
                        >
                            <img src={currentScreenshot} alt="Active Context" className="max-w-full max-h-full object-contain" />
                            
                            {/* Controls Overlay */}
                            <div className="absolute inset-0 pointer-events-none flex items-center justify-between px-2">
                                {activeSection.screenshots.length > 1 && (
                                    <>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); prevImage(); }} 
                                            className="pointer-events-auto p-2 rounded-full bg-white/80 text-slate-700 shadow-sm hover:bg-white hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <ChevronLeft size={24} />
                                        </button>
                                        <button 
                                            onClick={(e) => { e.stopPropagation(); nextImage(); }} 
                                            className="pointer-events-auto p-2 rounded-full bg-white/80 text-slate-700 shadow-sm hover:bg-white hover:scale-110 transition-all opacity-0 group-hover:opacity-100"
                                        >
                                            <ChevronRight size={24} />
                                        </button>
                                    </>
                                )}
                            </div>

                            <button 
                                onClick={(e) => { e.stopPropagation(); handleRemoveScreenshot(activeScreenshotIndex); }} 
                                className="absolute top-3 right-3 pointer-events-auto bg-white/90 p-2 rounded-full text-red-600 hover:text-red-700 shadow-sm transition-all hover:scale-110 z-10"
                                title="Remove this screenshot"
                            >
                                <Trash2 size={16} />
                            </button>
                        </div>

                        {/* Thumbnail Strip */}
                        <div className="h-20 shrink-0 flex gap-2 overflow-x-auto pb-1 px-1 custom-scrollbar">
                            {activeSection.screenshots.map((src, idx) => (
                                <button 
                                    key={idx} 
                                    onClick={() => setActiveScreenshotIndex(idx)}
                                    className={`relative w-16 h-16 shrink-0 rounded-lg overflow-hidden border-2 transition-all ${idx === activeScreenshotIndex ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200 opacity-70 hover:opacity-100 hover:border-slate-300'}`}
                                >
                                    <img src={src} className="w-full h-full object-cover" alt={`Thumbnail ${idx}`} />
                                </button>
                            ))}
                            {/* Add Button */}
                            <button 
                                onClick={() => imageInputRef.current?.click()}
                                className="w-16 h-16 shrink-0 rounded-lg border-2 border-dashed border-slate-300 flex items-center justify-center text-slate-400 hover:border-blue-400 hover:text-blue-500 hover:bg-blue-50 transition-all"
                                title="Add more screenshots"
                            >
                                <Plus size={24} />
                            </button>
                        </div>
                     </div>
                 ) : (
                    // Empty State
                    <div 
                        onClick={() => imageInputRef.current?.click()}
                        className="flex-1 border-2 border-dashed border-slate-300 rounded-xl flex flex-col items-center justify-center p-6 text-slate-400 cursor-pointer hover:border-slate-400 hover:bg-slate-100 transition-colors"
                    >
                            <Upload size={32} className="mb-2 opacity-50" />
                            <span className="text-sm text-center">Upload App Screenshots<br/>for "{activeSection?.id}"</span>
                    </div>
                 )}
            </div>
        </main>
      </div>
      
      {/* Lightbox Overlay */}
      {isLightboxOpen && hasScreenshots && activeSection && (
        <div className="fixed inset-0 z-[100] bg-black/60 flex items-center justify-center backdrop-blur-md animate-in fade-in duration-200" onClick={() => setIsLightboxOpen(false)}>
            {/* Toolbar */}
            <div className="absolute top-4 right-4 flex gap-4 text-white/80 z-10">
                 <div className="bg-white/10 px-3 py-1 rounded-full text-sm font-medium">
                    {activeScreenshotIndex + 1} / {activeSection.screenshots.length}
                 </div>
                 <button onClick={() => setIsLightboxOpen(false)} className="hover:text-white transition-colors p-1 hover:bg-white/20 rounded-full">
                    <X size={24} />
                 </button>
            </div>

            {/* Main Image */}
            <div className="w-full h-full p-4 md:p-12 flex items-center justify-center" onClick={(e) => e.stopPropagation()}>
                <img 
                    src={currentScreenshot} 
                    alt="Zoomed Context" 
                    className="max-w-full max-h-full object-contain shadow-2xl rounded-sm" 
                />
            </div>

            {/* Navigation Buttons */}
             {activeSection.screenshots.length > 1 && (
                <>
                    <button 
                        onClick={(e) => { e.stopPropagation(); prevImage(); }}
                        className="absolute left-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 hover:scale-110 transition-all backdrop-blur-md z-10"
                    >
                        <ChevronLeft size={32} />
                    </button>
                    <button 
                        onClick={(e) => { e.stopPropagation(); nextImage(); }}
                        className="absolute right-4 top-1/2 -translate-y-1/2 p-3 rounded-full bg-white/10 text-white hover:bg-white/20 hover:scale-110 transition-all backdrop-blur-md z-10"
                    >
                        <ChevronRight size={32} />
                    </button>
                </>
            )}
        </div>
      )}

      {/* Loading Overlay */}
      {isProcessing && (
          <div className="fixed inset-0 bg-white/80 backdrop-blur-sm z-50 flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mb-4"></div>
              <p className="text-slate-600 font-medium">Processing...</p>
          </div>
      )}
    </div>
  );
}

export default App;