import ExcelJS from "exceljs";

export interface PulseValidationExportData {
  siteInfo: { feed: string; serialNumber: string; site: string; building: string };
  mode: "water" | "gas";
  validationName: string;
  firstRead: { dateTime: string; reading: string; imageBase64: string | null; imageMime: string | null };
  secondRead: { dateTime: string; reading: string; imageBase64: string | null; imageMime: string | null };
  hubCount: number;
  factor: number;
  hubVolume: number;
  physicalDiff: number;
  accuracy: number;
  status: string;
  comments: string;
  rawHubData: { event: string; channel: string; usage: number }[];
}

export async function generatePulseValidationExcel(data: PulseValidationExportData): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const unit = data.mode === "water" ? "m³" : "NcM";
  const hubVolumeLabel = data.mode === "water" ? "Hub Water m3" : "Hub Gas NcM";

  const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" }, left: { style: "thin" },
    bottom: { style: "thin" }, right: { style: "thin" },
  };

  // ─── Sheet 1: DV ───
  const ws = workbook.addWorksheet("DV");
  ws.columns = [
    { width: 30 }, // A - Load
    { width: 18 }, // B - Date
    { width: 14 }, // C - First Read
    { width: 18 }, // D - Date
    { width: 14 }, // E - Second Read
    { width: 14 }, // F - Difference
    { width: 14 }, // G - Hub Count
    { width: 10 }, // H - Factor
    { width: 14 }, // I - Hub Volume
    { width: 12 }, // J - Accuracy
    { width: 10 }, // K - Result
  ];

  // Row 1: Site name header (light blue bg)
  ws.mergeCells("A1:K1");
  const titleCell = ws.getCell("A1");
  titleCell.value = data.siteInfo.site || data.validationName;
  titleCell.font = { bold: true, size: 16 };
  titleCell.alignment = centerAlign;
  titleCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD6DCE4" } };
  ws.getRow(1).height = 30;

  // Rows 4-7: Site metadata
  const metaRows: [string, string][] = [
    ["Feed:", data.siteInfo.feed],
    ["SN:", data.siteInfo.serialNumber],
    ["Site:", data.siteInfo.site],
    ["Building", data.siteInfo.building],
  ];
  metaRows.forEach(([label, value], i) => {
    const row = 4 + i;
    ws.getCell(`A${row}`).value = label;
    ws.getCell(`A${row}`).font = { bold: true, size: 11 };
    ws.getCell(`C${row}`).value = value;
    ws.getCell(`C${row}`).font = { size: 11 };
  });

  // Row 8: Summary header (green bg)
  ws.getCell("A8").value = "Summary";
  ws.getCell("A8").font = { bold: true, size: 11 };
  ws.getCell("A8").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
  ws.getCell("C8").value = data.comments ? data.comments.split("\n")[0] : "";
  ws.getCell("C8").font = { size: 11 };

  // Row 9: Summary detail
  if (data.comments) {
    const lines = data.comments.split("\n");
    if (lines.length > 1) {
      ws.getCell("C9").value = lines.slice(1).join(" ");
    } else {
      // Generate auto summary
      ws.getCell("C9").value = `Bravegen data logger collecting pulses accurately at ${data.accuracy.toFixed(0)}%`;
    }
    ws.getCell("C9").font = { size: 11 };
  }

  // Row 24: Data table headers (dark bg)
  const dataHeaders = ["Load", "Date", "First Read", "Date", "Second Read", "Difference", "Hub Count", "Factor", hubVolumeLabel, "Accuracy", "Result"];
  const headerRow = 24;
  dataHeaders.forEach((label, i) => {
    const cell = ws.getCell(headerRow, i + 1);
    cell.value = label;
    cell.font = { bold: true, size: 10, color: { argb: "FFFFFFFF" } };
    cell.alignment = centerAlign;
    cell.border = thinBorder;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF4472C4" } };
  });

  // Row 25: Data row
  const r1 = parseFloat(data.firstRead.reading) || 0;
  const r2 = parseFloat(data.secondRead.reading) || 0;
  const dataRow = 25;

  const formatDt = (dt: string) => {
    if (!dt) return "";
    const d = new Date(dt);
    if (isNaN(d.getTime())) return dt;
    return `${d.getMonth() + 1}/${d.getDate()}/${d.getFullYear()} ${d.getHours().toString().padStart(2, "0")}:${d.getMinutes().toString().padStart(2, "0")}`;
  };

  const rowValues: (string | number)[] = [
    data.siteInfo.site || data.validationName,
    formatDt(data.firstRead.dateTime),
    r1,
    formatDt(data.secondRead.dateTime),
    r2,
    data.physicalDiff,
    data.hubCount,
    data.factor,
    data.hubVolume,
    data.accuracy / 100,
    data.status,
  ];

  rowValues.forEach((val, i) => {
    const cell = ws.getCell(dataRow, i + 1);
    cell.value = val;
    cell.alignment = centerAlign;
    cell.border = thinBorder;
    cell.font = { size: 10 };
  });

  // Format accuracy as percentage with green bg if PASS
  const accCell = ws.getCell(dataRow, 10);
  accCell.numFmt = "0.00%";
  if (data.accuracy >= 95 && data.accuracy <= 105) {
    accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
  } else if (data.accuracy >= 90 && data.accuracy <= 110) {
    accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
  } else if (data.accuracy > 0) {
    accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
  }

  // Add borders to empty rows below for the table structure
  for (let r = 26; r <= 34; r++) {
    for (let c = 1; c <= 11; c++) {
      ws.getCell(r, c).border = thinBorder;
    }
  }

  // ─── Sheet 2: Photos ───
  const photoSheet = workbook.addWorksheet("Photos");
  photoSheet.getColumn(1).width = 60;
  photoSheet.getColumn(2).width = 60;

  photoSheet.getCell("A1").value = "First Read";
  photoSheet.getCell("A1").font = { bold: true, size: 14 };
  photoSheet.getCell("B1").value = "Second Read";
  photoSheet.getCell("B1").font = { bold: true, size: 14 };

  if (data.firstRead.imageBase64 && data.firstRead.imageMime) {
    const ext = data.firstRead.imageMime.includes("png") ? "png" : "jpeg";
    const imgId = workbook.addImage({ base64: data.firstRead.imageBase64, extension: ext });
    photoSheet.addImage(imgId, { tl: { col: 0, row: 1 }, ext: { width: 400, height: 550 } });
  }

  if (data.secondRead.imageBase64 && data.secondRead.imageMime) {
    const ext = data.secondRead.imageMime.includes("png") ? "png" : "jpeg";
    const imgId = workbook.addImage({ base64: data.secondRead.imageBase64, extension: ext });
    photoSheet.addImage(imgId, { tl: { col: 1, row: 1 }, ext: { width: 400, height: 550 } });
  }

  // ─── Sheet 3: Bravegen Data ───
  const bgSheet = workbook.addWorksheet("Bravegen Data");
  const bgHeaders = ["Date/Time", "Channel", "Pulse Count"];
  bgSheet.columns = [{ width: 24 }, { width: 28 }, { width: 16 }];

  const bgHeaderRow = bgSheet.getRow(1);
  bgHeaders.forEach((h, i) => {
    const cell = bgHeaderRow.getCell(i + 1);
    cell.value = h;
    cell.font = { bold: true, size: 11 };
    cell.alignment = centerAlign;
    cell.border = thinBorder;
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
  });

  data.rawHubData.forEach((row, idx) => {
    const r = bgSheet.getRow(idx + 2);
    [row.event, row.channel, row.usage].forEach((v, i) => {
      const cell = r.getCell(i + 1);
      cell.value = v ?? "";
      cell.alignment = centerAlign;
      cell.border = thinBorder;
      cell.font = { size: 10 };
    });
  });

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
}
