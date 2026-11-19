import type { FamilyAdminState } from './familyAdminStore';

const personHeaders = ['fullName', 'gender', 'birthDate', 'branch', 'generation'];

async function createWorkbook() {
  // Loaded only when the user opens an Excel file or requests an Excel download.
  const ExcelJS = (await import('exceljs')).default;
  return new ExcelJS.Workbook();
}

function cellText(value: unknown): string {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  if (typeof value === 'object') {
    const object = value as { text?: string; result?: unknown; richText?: Array<{ text: string }> };
    if (object.text) return object.text;
    if (object.result !== undefined) return cellText(object.result);
    if (object.richText) return object.richText.map((part) => part.text).join('');
  }
  return String(value);
}

export async function readPersonXlsx(file: File): Promise<string[][]> {
  const workbook = await createWorkbook();
  const bytes = await file.arrayBuffer();
  await workbook.xlsx.load(bytes as unknown as Parameters<typeof workbook.xlsx.load>[0]);
  const sheet = workbook.getWorksheet('Person') || workbook.worksheets[0];
  if (!sheet) throw new Error('File Excel không có worksheet.');
  if (sheet.rowCount > 5001) throw new Error('Bản xem trước chỉ nhập tối đa 5.000 Person mỗi lần.');
  const rows: string[][] = [];
  for (let rowIndex = 1; rowIndex <= sheet.rowCount; rowIndex += 1) {
    const row = Array.from({ length: 5 }, (_, index) => cellText(sheet.getRow(rowIndex).getCell(index + 1).value).trim());
    if (row.some(Boolean)) rows.push(row);
  }
  return rows;
}

async function downloadWorkbook(workbook: Awaited<ReturnType<typeof createWorkbook>>, filename: string) {
  const buffer = await workbook.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buffer as unknown as BlobPart], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function downloadPersonTemplateXlsx(): Promise<void> {
  const workbook = await createWorkbook();
  const sheet = workbook.addWorksheet('Person');
  sheet.addRow(personHeaders);
  sheet.addRow(['Dương Văn Mẫu', 'male', '1990-01-01', 'Chi Trưởng', 6]);
  sheet.columns = [{ width: 28 }, { width: 14 }, { width: 17 }, { width: 24 }, { width: 15 }];
  sheet.getRow(1).font = { bold: true };
  await downloadWorkbook(workbook, 'mau-person-family-admin.xlsx');
}

export async function downloadFamilyXlsx(data: FamilyAdminState): Promise<void> {
  const workbook = await createWorkbook();
  const people = workbook.addWorksheet('Person');
  people.addRow(personHeaders);
  const visible = data.persons.filter((person) => !person.hidden && person.visibility !== 'private');
  visible.forEach((person) => people.addRow([
    person.fullName, person.gender, person.birthDate,
    data.branches.find((branch) => branch.id === person.branchId)?.name || '', person.generation,
  ]));
  people.columns = [{ width: 30 }, { width: 14 }, { width: 17 }, { width: 25 }, { width: 15 }];
  people.getRow(1).font = { bold: true };
  people.autoFilter = `A1:E${Math.max(1, people.rowCount)}`;
  people.views = [{ state: 'frozen', ySplit: 1 }];

  const allowedIds = new Set(visible.map((person) => person.id));
  const relations = workbook.addWorksheet('QuanHe');
  relations.addRow(['type', 'from', 'to', 'since']);
  data.relations.filter((relation) => allowedIds.has(relation.fromId) && allowedIds.has(relation.toId)).forEach((relation) => relations.addRow([
    relation.type,
    data.persons.find((person) => person.id === relation.fromId)?.fullName || '',
    data.persons.find((person) => person.id === relation.toId)?.fullName || '',
    relation.since,
  ]));
  relations.columns = [{ width: 24 }, { width: 30 }, { width: 30 }, { width: 17 }];
  relations.getRow(1).font = { bold: true };
  relations.views = [{ state: 'frozen', ySplit: 1 }];
  await downloadWorkbook(workbook, 'gia-pha-family-admin.xlsx');
}
