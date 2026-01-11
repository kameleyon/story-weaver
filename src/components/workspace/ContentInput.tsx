import { useState } from "react";
import { Upload, FileText, Image } from "lucide-react";
import { motion } from "framer-motion";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";

interface ContentInputProps {
  content: string;
  onContentChange: (content: string) => void;
}

export function ContentInput({ content, onContentChange }: ContentInputProps) {
  const [isDragging, setIsDragging] = useState(false);

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => setIsDragging(false);

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    // Mock file handling - would process files here
    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      onContentChange(`[Uploaded: ${files.map((f) => f.name).join(", ")}]`);
    }
  };

  return (
    <Card className="overflow-hidden border-2 border-dashed border-border bg-card">
      <Tabs defaultValue="text" className="w-full">
        <TabsList className="w-full justify-start rounded-none border-b bg-muted/30 p-0">
          <TabsTrigger
            value="text"
            className="gap-2 rounded-none border-b-2 border-transparent px-6 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <FileText className="h-4 w-4" />
            Text
          </TabsTrigger>
          <TabsTrigger
            value="upload"
            className="gap-2 rounded-none border-b-2 border-transparent px-6 py-3 data-[state=active]:border-primary data-[state=active]:bg-transparent"
          >
            <Upload className="h-4 w-4" />
            Upload
          </TabsTrigger>
        </TabsList>

        <TabsContent value="text" className="m-0">
          <Textarea
            placeholder="Paste your content here... (documents, articles, scripts, or any text you want to transform into a video)"
            className="min-h-[200px] resize-none rounded-none border-0 bg-transparent p-4 text-base focus-visible:ring-0"
            value={content}
            onChange={(e) => onContentChange(e.target.value)}
          />
        </TabsContent>

        <TabsContent value="upload" className="m-0">
          <motion.div
            className={`flex min-h-[200px] cursor-pointer flex-col items-center justify-center gap-4 p-8 transition-colors ${
              isDragging ? "bg-brand-surface/50" : "bg-transparent"
            }`}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            whileHover={{ backgroundColor: "hsl(var(--muted) / 0.3)" }}
          >
            <motion.div
              className="flex h-16 w-16 items-center justify-center rounded-2xl bg-muted"
              animate={{ scale: isDragging ? 1.1 : 1 }}
            >
              <Upload className="h-8 w-8 text-muted-foreground" />
            </motion.div>
            <div className="text-center">
              <p className="font-medium">Drop files here or click to upload</p>
              <p className="text-sm text-muted-foreground">PDF, DOCX, TXT, or Images</p>
            </div>
            <div className="flex gap-2">
              <div className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <FileText className="h-3 w-3" /> PDF
              </div>
              <div className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <FileText className="h-3 w-3" /> DOCX
              </div>
              <div className="flex items-center gap-1 rounded-full bg-muted px-3 py-1 text-xs">
                <Image className="h-3 w-3" /> Images
              </div>
            </div>
          </motion.div>
        </TabsContent>
      </Tabs>
    </Card>
  );
}
