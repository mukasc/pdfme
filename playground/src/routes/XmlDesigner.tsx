import React, { useRef, useEffect, useState } from 'react';
import { Designer } from '@pdfme/ui';
import { generate } from '@pdfme/generator';
import { getFontsData, getBlankTemplate, downloadJsonFile } from '../helper';
import { getPlugins } from '../plugins';
import { FileUp, Plus, Code2, Play, Download, Eye, EyeOff, Upload } from 'lucide-react';

export default function XmlDesigner() {
  const designerRef = useRef<HTMLDivElement | null>(null);
  const designer = useRef<Designer | null>(null);
  const [xmlKeys, setXmlKeys] = useState<string[]>([]);
  const [xmlData, setXmlData] = useState<Record<string, string>>({});
  const [fileName, setFileName] = useState<string>('');
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [originalBasePdf, setOriginalBasePdf] = useState<string | null>(null);
  const [isBackgroundVisible, setIsBackgroundVisible] = useState<boolean>(true);

  useEffect(() => {
    if (!designerRef.current) return;
    
    // Initialize Designer with a blank template
    designer.current = new Designer({
      domContainer: designerRef.current,
      template: getBlankTemplate(),
      options: {
        font: getFontsData(),
        lang: 'en',
        theme: {
          token: { colorPrimary: '#25c2a0' },
        },
        maxZoom: 300,
      },
      plugins: getPlugins(),
    });

    return () => {
      if (designer.current) {
        try {
          designer.current.destroy();
        } catch (e) {}
      }
    };
  }, []);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);

    const reader = new FileReader();
    reader.onload = (event) => {
      const xmlString = event.target?.result as string;
      parseXML(xmlString);
    };
    reader.readAsText(file);
  };

  const handleBasePdfUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !designer.current) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const basePdfDataUrl = event.target?.result as string;
      setOriginalBasePdf(basePdfDataUrl);
      setIsBackgroundVisible(true);
      const template = designer.current!.getTemplate();
      designer.current!.updateTemplate({
        ...template,
        basePdf: basePdfDataUrl
      });
    };
    reader.readAsDataURL(file);
  };

  const toggleBackground = () => {
    if (!designer.current || !originalBasePdf) return;
    
    const template = designer.current.getTemplate();
    const newVisibility = !isBackgroundVisible;
    
    designer.current.updateTemplate({
      ...template,
      basePdf: newVisibility ? originalBasePdf : getBlankTemplate().basePdf
    });
    
    setIsBackgroundVisible(newVisibility);
  };

  const parseXML = (xmlString: string) => {
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "text/xml");
      
      const keys = new Set<string>();
      const data: Record<string, string> = {};
      
      const extractKeys = (node: Node) => {
        if (node.nodeType === Node.ELEMENT_NODE) {
          const element = node as Element;
          // If element has no element children, it's a leaf node containing text
          if (element.children.length === 0 && element.textContent?.trim()) {
            keys.add(element.tagName);
            data[element.tagName] = element.textContent.trim();
          }
          // Continue recursively
          for (let i = 0; i < element.children.length; i++) {
            extractKeys(element.children[i]);
          }
        }
      };

      if (xmlDoc.documentElement) {
        extractKeys(xmlDoc.documentElement);
      }
      
      setXmlKeys(Array.from(keys));
      setXmlData(data);
    } catch (err) {
      console.error("Error parsing XML:", err);
      alert("Failed to parse XML file.");
    }
  };

  const addFieldToDesigner = (keyName: string) => {
    if (!designer.current) return;
    
    const template = designer.current.getTemplate();
    
    // We append a new schema to the first page (schemas[0])
    // The name of the schema is the XML key
    template.schemas[0].push({
      name: keyName,
      type: 'text',
      content: xmlData[keyName] || keyName, // Show the real value as placeholder in Designer
      position: { x: 10, y: 10 },
      width: 50,
      height: 10,
    });
    
    designer.current.updateTemplate(template);
  };

  const handleGeneratePdf = async () => {
    if (!designer.current) return;
    try {
      setIsGenerating(true);
      const template = designer.current.getTemplate();
      const inputs = [xmlData];
      
      const pdf = await generate({ template, inputs, options: { font: getFontsData() }, plugins: getPlugins() });
      
      const blob = new Blob([pdf.buffer], { type: 'application/pdf' });
      window.open(URL.createObjectURL(blob));
    } catch (err) {
      alert("Erro ao gerar PDF: " + err);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleSaveLayout = () => {
    if (!designer.current) return;
    const template = designer.current.getTemplate();
    downloadJsonFile(template, 'layout_genexus');
  };

  const handleImportLayout = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !designer.current) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const jsonString = event.target?.result as string;
        const template = JSON.parse(jsonString);
        designer.current!.updateTemplate(template);
        if (template.basePdf) {
          setOriginalBasePdf(template.basePdf as string);
          setIsBackgroundVisible(true);
        }
      } catch (err) {
        alert("Erro ao importar layout: Arquivo JSON inválido.");
      }
    };
    reader.readAsText(file);
    e.target.value = ''; // Reset the input
  };

  return (
    <div className="flex h-[calc(100vh-65px)] bg-gray-50">
      <div className="w-80 bg-white border-r border-gray-200 flex flex-col shadow-sm z-10">
        <div className="p-4 bg-gray-800 text-white">
          <h2 className="text-lg font-bold flex items-center gap-2">
            <Code2 className="size-5" />
            XML Mapper
          </h2>
          <p className="text-xs text-gray-300 mt-1">Transforme tags em layout</p>
        </div>
        
        <div className="p-4 border-b border-gray-200">
          <div className="flex gap-2 mb-3">
            <label className="flex-1 flex flex-col items-center justify-center h-12 border border-gray-300 rounded cursor-pointer bg-white hover:bg-gray-50 transition-colors">
              <span className="text-sm text-gray-700 font-medium">1. Fundo (PDF/Img)</span>
              <input 
                type="file" 
                className="hidden" 
                accept="application/pdf,image/*" 
                onChange={handleBasePdfUpload} 
              />
            </label>
            {originalBasePdf && (
              <button
                onClick={toggleBackground}
                className="w-12 h-12 flex items-center justify-center border border-gray-300 rounded bg-white hover:bg-gray-100 transition-colors text-gray-600"
                title={isBackgroundVisible ? "Esconder Fundo" : "Mostrar Fundo"}
              >
                {isBackgroundVisible ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
              </button>
            )}
          </div>
          <label className="flex flex-col items-center justify-center w-full h-24 border-2 border-dashed border-gray-300 rounded-lg cursor-pointer bg-gray-50 hover:bg-gray-100 transition-colors">
            <div className="flex flex-col items-center justify-center p-2 text-center">
              <FileUp className="size-6 text-gray-400 mb-1" />
              <p className="text-xs text-gray-500 font-semibold truncate w-full">
                {fileName ? fileName : "2. Upload XML"}
              </p>
            </div>
            <input 
              type="file" 
              className="hidden" 
              accept="text/xml,.xml" 
              onChange={handleFileUpload} 
            />
          </label>
        </div>

        <div className="flex-1 overflow-y-auto p-4 bg-gray-50">
          {xmlKeys.length > 0 ? (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-gray-600 mb-3 flex justify-between items-center">
                Campos Encontrados
                <span className="bg-gray-200 text-gray-700 py-0.5 px-2 rounded-full text-xs">{xmlKeys.length}</span>
              </h3>
              {xmlKeys.map((key) => (
                <div key={key} className="group flex items-center justify-between p-2 bg-white border border-gray-200 rounded hover:border-blue-400 transition-colors">
                  <div className="flex flex-col overflow-hidden">
                    <span className="text-sm font-medium text-gray-700 truncate" title={key}>{key}</span>
                    <span className="text-xs text-gray-400 truncate" title={xmlData[key]}>{xmlData[key]}</span>
                  </div>
                  <button 
                    onClick={() => addFieldToDesigner(key)}
                    className="p-1.5 text-blue-600 bg-blue-50 rounded hover:bg-blue-100 opacity-0 group-hover:opacity-100 transition-opacity"
                    title="Adicionar ao Layout"
                  >
                    <Plus className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="h-full flex flex-col items-center justify-center text-gray-400">
              <Code2 className="size-12 text-gray-200 mb-2" />
              <p className="text-sm text-center">Faça upload de um XML para ver os campos aqui.</p>
            </div>
          )}
        </div>
        
        <div className="p-4 border-t border-gray-200 bg-gray-50 flex flex-col gap-2">
          <div className="flex gap-2">
            <label className="flex-1 flex items-center justify-center gap-1 bg-gray-200 hover:bg-gray-300 text-gray-700 font-semibold py-2 px-2 rounded shadow-sm transition-colors cursor-pointer text-xs">
              <Upload className="size-4" />
              Importar
              <input 
                type="file" 
                className="hidden" 
                accept="application/json,.json" 
                onChange={handleImportLayout} 
              />
            </label>
            <button 
              onClick={handleSaveLayout}
              className="flex-1 flex items-center justify-center gap-1 bg-blue-600 hover:bg-blue-700 text-white font-semibold py-2 px-2 rounded shadow-sm transition-colors text-xs"
            >
              <Download className="size-4" />
              Salvar
            </button>
          </div>
          
          <button 
            onClick={handleGeneratePdf}
            disabled={xmlKeys.length === 0 || isGenerating}
            className="w-full flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-semibold py-2 px-4 rounded shadow-sm transition-colors mt-2"
          >
            <Play className="size-4" />
            {isGenerating ? 'Gerando...' : 'Testar PDF Final'}
          </button>
          <p className="text-xs text-center text-gray-500 mt-2">
            Usa os valores reais extraídos do XML.
          </p>
        </div>
      </div>

      <div className="flex-1 relative min-h-0">
        <div ref={designerRef} className="absolute inset-0" />
      </div>
    </div>
  );
}
