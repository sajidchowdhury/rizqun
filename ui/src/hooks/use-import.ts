import { useMutation, useQueryClient } from '@tanstack/react-query';

import { toast } from '@/lib/toast';
import { tokenStore } from '@/lib/token-store';
import { env } from '@/lib/env';
import type {
  ImportFormat,
  ImportPreview,
  ImportResult,
} from '@/types/product';

// ─── Import preview (POST /products/import with dryRun=true) ──
//
// Uploads the Excel/CSV file to the backend with dryRun=true so the
// backend parses it + detects duplicates but doesn't write anything.
// Returns the preview data for the UI to show.
//
// Uses raw fetch (not the axios `api` instance) because we need to
// send multipart/form-data, and the api instance's JSON content-type
// header would break the file upload.

export function useImportPreview() {
  return useMutation({
    mutationFn: async ({
      file,
      section = 'auto',
      groupName,
      categoryName,
    }: {
      file: File;
      section?: ImportFormat;
      groupName?: string;
      categoryName?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('section', section);
      formData.append('dryRun', 'true');
      if (groupName) formData.append('groupName', groupName);
      if (categoryName) formData.append('categoryName', categoryName);

      const token = tokenStore.get();
      const response = await fetch(`${env.apiBaseUrl}/products/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message ?? `Upload failed (${response.status})`);
      }

      const body = await response.json();
      if (!body.success) {
        throw new Error(body?.message ?? 'Import preview failed');
      }
      return body.data as ImportPreview;
    },
    onError: (error: Error) => toast.error(error.message),
  });
}

// ─── Import execute (POST /products/import with dryRun=false) ─
//
// Actually imports the file. Same endpoint, just dryRun=false.
// The backend re-parses + re-detects duplicates (in case anything
// changed between preview and execute) and writes the new products.

export function useImportExecute() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      section = 'auto',
      groupName,
      categoryName,
    }: {
      file: File;
      section?: ImportFormat;
      groupName?: string;
      categoryName?: string;
    }) => {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('section', section);
      formData.append('dryRun', 'false');
      if (groupName) formData.append('groupName', groupName);
      if (categoryName) formData.append('categoryName', categoryName);

      const token = tokenStore.get();
      const response = await fetch(`${env.apiBaseUrl}/products/import`, {
        method: 'POST',
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: formData,
        credentials: 'include',
      });

      if (!response.ok) {
        const errorBody = await response.json().catch(() => ({}));
        throw new Error(errorBody?.message ?? `Import failed (${response.status})`);
      }

      const body = await response.json();
      if (!body.success) {
        throw new Error(body?.message ?? 'Import failed');
      }
      return body.data as ImportResult;
    },
    onSuccess: (result) => {
      // Invalidate products + search caches so the new products show up
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success(
        `Imported ${result.imported} products · skipped ${result.skippedDuplicates} duplicates`,
      );
    },
    onError: (error: Error) => toast.error(error.message),
  });
}
