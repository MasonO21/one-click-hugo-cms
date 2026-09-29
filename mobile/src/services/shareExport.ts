import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { toJson, toMarkdown, type ExportData, type ExportUnits } from '@/domain/export';

export type ExportKind = 'markdown' | 'json';

function fileStamp(now: number): string {
  const d = new Date(now);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Writes the journal to a temporary file and opens the system share sheet.
export async function shareExport(
  kind: ExportKind,
  data: ExportData,
  units: ExportUnits,
  now: number = Date.now(),
): Promise<'shared' | 'unavailable'> {
  if (!(await Sharing.isAvailableAsync())) return 'unavailable';

  const isJson = kind === 'json';
  const file = new File(Paths.cache, `trail-notes-${fileStamp(now)}.${isJson ? 'json' : 'md'}`);
  file.create({ overwrite: true });
  file.write(isJson ? toJson(data, now) : toMarkdown(data, units));

  await Sharing.shareAsync(file.uri, {
    mimeType: isJson ? 'application/json' : 'text/markdown',
    UTI: isJson ? 'public.json' : 'net.daringfireball.markdown',
    dialogTitle: 'Export Trail Notes',
  });
  return 'shared';
}
