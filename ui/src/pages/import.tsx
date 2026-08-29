import { useCallback, useRef, useState } from 'react';
import {
  AlertCircle,
  Check,
  CheckCircle2,
  FileSpreadsheet,
  Loader2,
  Package,
  Upload,
  X,
} from 'lucide-react';

import { cn } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { useAuth } from '@/hooks/use-auth';
import { useImportPreview, useImportExecute } from '@/hooks/use-import';
import { formatBDT } from '@/contexts/cart-store';
import type { ImportFormat, ImportPreview, ImportPreviewRow } from '@/types/product';

// ─── Page ─────────────────────────────────────────────────────

export function ImportPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'super_admin';

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center rounded-xl border border-dashed py-16 text-center">
        <AlertCircle className="size-10 text-muted-foreground/40" />
        <p className="mt-3 text-sm font-medium">Admin access required</p>
        <p className="text-xs text-muted-foreground">
          Only super admins can import products.
        </p>
      </div>
    );
  }

  return <ImportWizard />;
}

// ─── Import wizard (3 steps: upload → preview → confirm) ─────

type Step = 'upload' | 'preview' | 'done';

function ImportWizard() {
  const [step, setStep] = useState<Step>('upload');
  const [file, setFile] = useState<File | null>(null);
  const [section, setSection] = useState<ImportFormat>('auto');
  const [preview, setPreview] = useState<ImportPreview | null>(null);

  const previewMutation = useImportPreview();
  const executeMutation = useImportExecute();

  // ── Upload step ─────────────────────────────────────────────
  function handleFileSelected(f: File) {
    setFile(f);
  }

  async function handlePreview() {
    if (!file) return;
    const result = await previewMutation.mutateAsync({ file, section });
    setPreview(result);
    setStep('preview');
  }

  // ── Confirm step ────────────────────────────────────────────
  async function handleConfirm() {
    if (!file) return;
    const result = await executeMutation.mutateAsync({ file, section });
    setStep('done');
    // Keep the result in `preview` for the summary — we overwrite
    // the preview with the result stats
    setPreview({
      format: result.format,
      totalRows: result.imported + result.skippedDuplicates,
      newProducts: result.imported,
      duplicates: result.skippedDuplicates,
      errors: result.errors,
      rows: [],
      categories: [],
      vendors: [],
    });
  }

  function handleReset() {
    setStep('upload');
    setFile(null);
    setPreview(null);
  }

  if (step === 'done') {
    return <ImportDone preview={preview} onReset={handleReset} />;
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-semibold tracking-tight">Import Products</h1>
        <p className="text-sm text-muted-foreground">
          Upload an Excel/CSV file to bulk-import grocery or medicine products. Duplicates are detected by name and skipped automatically.
        </p>
      </header>

      {/* Step indicator */}
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <StepBadge num={1} active={step === 'upload'} done={step !== 'upload'}>Upload file</StepBadge>
        <span className="text-muted-foreground/40">→</span>
        <StepBadge num={2} active={step === 'preview'} done={false}>Preview & dedup</StepBadge>
        <span className="text-muted-foreground/40">→</span>
        <StepBadge num={3} active={false} done={false}>Import</StepBadge>
      </div>

      {/* Upload step */}
      {step === 'upload' && (
        <div className="space-y-4">
          {/* Format selector */}
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-base">Format</CardTitle>
              <CardDescription>What type of file are you importing?</CardDescription>
            </CardHeader>
            <CardContent>
              <Select value={section} onValueChange={(v) => setSection(v as ImportFormat)}>
                <SelectTrigger className="w-full sm:w-[280px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="auto">Auto-detect (recommended)</SelectItem>
                  <SelectItem value="grocery">Grocery (Chaldal format)</SelectItem>
                  <SelectItem value="medicine">Medicine (Labaid format)</SelectItem>
                </SelectContent>
              </Select>
            </CardContent>
          </Card>

          {/* Drop zone */}
          <DropZone onFileSelected={handleFileSelected} />

          {/* Upload button */}
          {file && (
            <div className="flex items-center justify-between rounded-lg border bg-card p-3">
              <div className="flex items-center gap-3">
                <FileSpreadsheet className="size-8 text-commerce" />
                <div>
                  <div className="text-sm font-medium">{file.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="sm" onClick={() => setFile(null)}>
                  <X className="size-4" /> Remove
                </Button>
                <Button onClick={handlePreview} disabled={previewMutation.isPending}>
                  {previewMutation.isPending ? (
                    <>
                      <Loader2 className="size-4 animate-spin" /> Parsing…
                    </>
                  ) : (
                    <>
                      <Check className="size-4" /> Preview
                    </>
                  )}
                </Button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Preview step */}
      {step === 'preview' && preview && (
        <ImportPreviewView
          preview={preview}
          onBack={() => setStep('upload')}
          onConfirm={handleConfirm}
          isImporting={executeMutation.isPending}
        />
      )}
    </div>
  );
}

// ─── Drop zone ────────────────────────────────────────────────

function DropZone({
  onFileSelected,
}: {
  onFileSelected: (f: File) => void;
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragging(false);
      const f = e.dataTransfer.files[0];
      if (f) onFileSelected(f);
    },
    [onFileSelected],
  );

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={handleDrop}
      onClick={() => inputRef.current?.click()}
      className={cn(
        'flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed py-16 text-center transition-colors',
        dragging
          ? 'border-commerce bg-commerce-soft/50'
          : 'border-border hover:border-commerce/40 hover:bg-accent/50',
      )}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xls,.csv"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
        }}
      />
      <div className="flex size-16 items-center justify-center rounded-full bg-commerce-soft">
        <Upload className="size-8 text-commerce" />
      </div>
      <p className="mt-4 text-sm font-medium">
        {dragging ? 'Drop the file here' : 'Drag & drop an Excel or CSV file'}
      </p>
      <p className="text-xs text-muted-foreground">
        or click to browse · .xlsx, .xls, .csv · max 10MB
      </p>
    </div>
  );
}

// ─── Preview view ─────────────────────────────────────────────

function ImportPreviewView({
  preview,
  onBack,
  onConfirm,
  isImporting,
}: {
  preview: ImportPreview;
  onBack: () => void;
  onConfirm: () => void;
  isImporting: boolean;
}) {
  return (
    <div className="space-y-4">
      {/* Stats summary */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard
          label="Total rows"
          value={preview.totalRows}
          icon={<Package className="size-4" />}
        />
        <StatCard
          label="New products"
          value={preview.newProducts}
          icon={<CheckCircle2 className="size-4 text-commerce" />}
          highlight="commerce"
        />
        <StatCard
          label="Duplicates"
          value={preview.duplicates}
          icon={<AlertCircle className="size-4 text-amber-500" />}
          highlight="amber"
        />
        <StatCard
          label="Errors"
          value={preview.errors}
          icon={<AlertCircle className="size-4 text-red-500" />}
          highlight="red"
        />
      </div>

      {/* Format + category + vendor breakdown */}
      <div className="grid gap-3 sm:grid-cols-2">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-sm">
              Format: <Badge variant="outline" className="ml-1">{preview.format}</Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <div className="text-xs font-medium text-muted-foreground">Categories detected</div>
            {preview.categories.map((c) => (
              <div key={c.name} className="flex items-center justify-between text-sm">
                <span>{c.name}</span>
                <span className="text-muted-foreground">
                  {c.count - c.duplicates} new · {c.duplicates} dup
                </span>
              </div>
            ))}
          </CardContent>
        </Card>

        {preview.vendors.length > 0 && (
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Vendors detected ({preview.vendors.length})</CardTitle>
            </CardHeader>
            <CardContent className="space-y-1">
              {preview.vendors.slice(0, 5).map((v) => (
                <div key={v.name} className="flex items-center justify-between text-sm">
                  <span className="truncate">{v.name}</span>
                  <span className="text-muted-foreground">{v.count}</span>
                </div>
              ))}
              {preview.vendors.length > 5 && (
                <div className="text-xs text-muted-foreground">
                  + {preview.vendors.length - 5} more…
                </div>
              )}
            </CardContent>
          </Card>
        )}
      </div>

      {/* Preview table */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm">Product preview (first {Math.min(preview.rows.length, 200)} rows)</CardTitle>
          <CardDescription>
            Green = new product, amber = duplicate (will be skipped)
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="max-h-[400px] overflow-y-auto rounded-lg border">
            <Table>
              <TableHeader className="sticky top-0 bg-card">
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Brand</TableHead>
                  <TableHead>Category</TableHead>
                  <TableHead className="text-right">Price</TableHead>
                  <TableHead className="w-20">Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {preview.rows.map((row) => (
                  <PreviewRow key={row.rowNumber} row={row} />
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Action buttons */}
      <div className="flex items-center justify-between">
        <Button variant="outline" onClick={onBack} disabled={isImporting}>
          <X className="size-4" /> Back
        </Button>
        <Button
          onClick={onConfirm}
          disabled={isImporting || preview.newProducts === 0}
          className="bg-commerce text-commerce-foreground hover:bg-commerce/90"
        >
          {isImporting ? (
            <>
              <Loader2 className="size-4 animate-spin" /> Importing…
            </>
          ) : (
            <>
              <Upload className="size-4" /> Import {preview.newProducts} product{preview.newProducts === 1 ? '' : 's'}
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

// ─── Preview row ──────────────────────────────────────────────

function PreviewRow({ row }: { row: ImportPreviewRow }) {
  return (
    <TableRow className={cn(row.isDuplicate && 'bg-amber-50 dark:bg-amber-950/20')}>
      <TableCell className="text-xs text-muted-foreground">{row.rowNumber}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <span className="truncate font-medium">{row.name}</span>
          {row.subCategoryName && (
            <Badge variant="outline" className="shrink-0 text-[10px]">
              {row.subCategoryName}
            </Badge>
          )}
        </div>
      </TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.brand ?? '—'}</TableCell>
      <TableCell className="text-sm text-muted-foreground">{row.categoryName}</TableCell>
      <TableCell className="text-right font-mono text-sm">{formatBDT(row.salePrice)}</TableCell>
      <TableCell>
        {row.isDuplicate ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/40 dark:text-amber-300">
            Duplicate
          </span>
        ) : (
          <span className="inline-flex items-center gap-1 rounded-full bg-commerce-soft px-2 py-0.5 text-[10px] font-medium text-commerce-soft-foreground">
            <Check className="size-2.5" /> New
          </span>
        )}
      </TableCell>
    </TableRow>
  );
}

// ─── Done view ────────────────────────────────────────────────

function ImportDone({
  preview,
  onReset,
}: {
  preview: ImportPreview | null;
  onReset: () => void;
}) {
  return (
    <div className="flex flex-col items-center justify-center gap-4 py-16 text-center">
      <div className="flex size-16 items-center justify-center rounded-full bg-commerce-soft">
        <CheckCircle2 className="size-8 text-commerce" />
      </div>
      <div>
        <h2 className="text-xl font-semibold">Import complete</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          {preview?.newProducts ?? 0} product{(preview?.newProducts ?? 0) === 1 ? '' : 's'} imported ·{' '}
          {preview?.duplicates ?? 0} duplicate{(preview?.duplicates ?? 0) === 1 ? '' : 's'} skipped
        </p>
      </div>
      <Button onClick={onReset}>
        <Upload className="size-4" /> Import another file
      </Button>
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────

function StepBadge({
  num,
  active,
  done,
  children,
}: {
  num: number;
  active: boolean;
  done: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        active
          ? 'bg-commerce text-commerce-foreground'
          : done
            ? 'bg-commerce-soft text-commerce-soft-foreground'
            : 'bg-muted text-muted-foreground',
      )}
    >
      <span className="flex size-4 items-center justify-center rounded-full bg-background/20 text-[10px]">
        {done ? <Check className="size-3" /> : num}
      </span>
      {children}
    </div>
  );
}

function StatCard({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: 'commerce' | 'amber' | 'red';
}) {
  return (
    <div className="rounded-lg border bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        {icon}
        {label}
      </div>
      <div
        className={cn(
          'mt-1 text-2xl font-bold tabular-nums',
          highlight === 'commerce' && 'text-commerce',
          highlight === 'amber' && 'text-amber-600',
          highlight === 'red' && 'text-red-600',
        )}
      >
        {value}
      </div>
    </div>
  );
}
