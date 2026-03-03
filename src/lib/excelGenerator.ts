import ExcelJS from "exceljs";
import { MeterReading, ExportSettings, ValidationExportData, ComparisonExportRow, BravegenRawRow } from "@/types/meter";

export async function generateValidationExcel(
  readings: MeterReading[],
  settings: ExportSettings,
  validationData?: ValidationExportData | null,
  comparisonData?: ComparisonExportRow[],
  bravegenRawData?: BravegenRawRow[],
  sourceImageBase64?: string | null,
  sourceImageMime?: string | null
): Promise<Blob> {
  const workbook = new ExcelJS.Workbook();
  const ws = workbook.addWorksheet("Validation", {
    views: [{ showGridLines: true }],
  });

  // Column widths
  ws.columns = [
    { width: 18 }, // A - Load
    { width: 10 }, // B - Load ID
    { width: 14 }, // C - Metering
    { width: 14 }, // D - Meter Supplied
    { width: 18 }, // E - CT Rating Dynamics
    { width: 18 }, // F - CT Rating Mender
    { width: 22 }, // G - Date/Time Meter Read
    { width: 20 }, // H - Physical Meter Read
    { width: 22 }, // I - Date/Time BG
    { width: 18 }, // J - BG Cumulative
    { width: 12 }, // K - Accuracy%
    { width: 18 }, // L - Comments
  ];

  const headerFont: Partial<ExcelJS.Font> = { bold: true, size: 11 };
  const centerAlign: Partial<ExcelJS.Alignment> = { horizontal: "center", vertical: "middle" };
  const thinBorder: Partial<ExcelJS.Borders> = {
    top: { style: "thin" },
    left: { style: "thin" },
    bottom: { style: "thin" },
    right: { style: "thin" },
  };

  // Row 2: Title
  ws.mergeCells("A2:K2");
  const titleCell = ws.getCell("A2");
  titleCell.value = "Template";
  titleCell.font = { bold: true, size: 14 };
  titleCell.alignment = centerAlign;

  // Row 4: Main Incomer header (yellow)
  ws.mergeCells("A4:K4");
  const incomerHeader = ws.getCell("A4");
  incomerHeader.value = "Main Incomer";
  incomerHeader.font = { bold: true, size: 12 };
  incomerHeader.alignment = centerAlign;
  incomerHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };

  // Row 5: ICP + serial number
  ws.getCell("A5").value = "ICP";
  ws.getCell("A5").font = { bold: true, italic: true };
  ws.getCell("B5").value = settings.serialNumber || "";

  // Row 6: Meter SN header
  ws.mergeCells("B6:D6");
  ws.getCell("B6").value = `Meter SN ${validationData?.retailSerialNumber || settings.serialNumber || ""}`;
  ws.getCell("B6").font = { bold: true };
  ws.getCell("B6").alignment = centerAlign;

  // Main Incomer header on right side
  ws.mergeCells("F6:G6");
  ws.getCell("F6").value = "Main Incomer";
  ws.getCell("F6").font = { bold: true };
  ws.getCell("F6").alignment = centerAlign;

  // Row 7: Sub-headers
  const row7Labels: { col: string; label: string }[] = [
    { col: "B", label: "DateTime" },
    { col: "C", label: "Reading" },
    { col: "F", label: "DateTime" },
    { col: "G", label: "Reading" },
  ];
  row7Labels.forEach(({ col, label }) => {
    const cell = ws.getCell(`${col}7`);
    cell.value = label;
    cell.font = headerFont;
    cell.alignment = centerAlign;
    cell.border = thinBorder;
  });

  if (validationData) {
    // Row 8: 1st readings
    ws.getCell("B8").value = validationData.loggerDateTime1;
    ws.getCell("C8").value = validationData.loggerReading1;
    ws.getCell("F8").value = validationData.refDateTime1;
    ws.getCell("G8").value = validationData.refReading1;
    ws.getCell("H8").value = "kWh";

    // Row 9: 2nd readings
    ws.getCell("B9").value = validationData.loggerDateTime2;
    ws.getCell("C9").value = validationData.loggerReading2;
    ws.getCell("F9").value = validationData.refDateTime2;
    ws.getCell("G9").value = validationData.refReading2;
    ws.getCell("H9").value = "kWh";

    // Row 10: Multiplier / Diff (FORMULAS)
    ws.getCell("A10").value = "Multiplier";
    ws.getCell("A10").font = { bold: true };
    ws.getCell("B10").value = validationData.multiplier;
    ws.getCell("C10").value = "Diff";
    ws.getCell("C10").font = { bold: true };
    // D10 = C9 - C8 (logger diff)
    ws.getCell("D10").value = { formula: "C9-C8" } as any;
    ws.getCell("F10").value = "Diff";
    ws.getCell("F10").font = { bold: true };
    // G10 = G9 - G8 (ref diff)
    ws.getCell("G10").value = { formula: "G9-G8" } as any;

    // Row 11: Convert to Actual kWh / Accuracy (FORMULAS)
    ws.getCell("A11").value = validationData.multiplier;
    ws.getCell("B11").value = "Convert to Actual kWh";
    ws.getCell("B11").font = { bold: true };
    // D11 = D10 * B10 (diff * multiplier = actual kWh)
    ws.getCell("D11").value = { formula: "D10*B10" } as any;
    ws.getCell("E11").value = "kWh";
    ws.getCell("F11").value = "Accuracy%";
    ws.getCell("F11").font = { bold: true };
    // G11 = (D11 / G10) * 100 with error handling
    const accCell = ws.getCell("G11");
    accCell.value = { formula: 'IF(G10=0,"#DIV/0!",D11/G10*100)' } as any;
    accCell.numFmt = '0.000"%"';
    accCell.font = { bold: true };
    // Color based on pre-calculated accuracy
    if (validationData.accuracy >= 95 && validationData.accuracy <= 105) {
      accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
    } else if (validationData.accuracy >= 90 && validationData.accuracy <= 110) {
      accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
    } else {
      accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
    }

    // Style rows 8-9
    [8, 9].forEach((r) => {
      ["B", "C", "F", "G", "H"].forEach((col) => {
        const cell = ws.getCell(`${col}${r}`);
        cell.alignment = centerAlign;
        cell.border = thinBorder;
        cell.font = { size: 10 };
      });
    });
  } else {
    // Fallback: basic info rows
    ws.getCell("A6").value = "Feed:";
    ws.getCell("B6").value = settings.feedName;
    ws.getCell("A7").value = "SN:";
    ws.getCell("B7").value = settings.serialNumber;
    ws.getCell("A8").value = "Site:";
    ws.getCell("B8").value = settings.siteName;
    ws.getCell("A9").value = "Building:";
    ws.getCell("B9").value = settings.buildingName;
    for (let r = 6; r <= 9; r++) {
      ws.getCell(`A${r}`).font = { bold: true };
    }

    // Row 10: Multiplier / Diff (FORMULAS even in fallback)
    ws.getCell("A10").value = "Multiplier";
    ws.getCell("B10").value = 1;
    ws.getCell("C10").value = "Diff";
    ws.getCell("D10").value = { formula: "C9-C8" } as any;
    ws.getCell("F10").value = "Diff";
    ws.getCell("G10").value = { formula: "G9-G8" } as any;
    ws.getCell("A11").value = "Convert to Actual kWh";
    ws.getCell("D11").value = { formula: "D10*B10" } as any;
    ws.getCell("E11").value = "kWh";
    ws.getCell("F11").value = "Accuracy%";
    ws.getCell("G11").value = { formula: 'IF(G10=0,"#DIV/0!",D11/G10*100)' } as any;
    ws.getCell("G11").numFmt = '0.000"%"';
  }

  // Row 14: Data table headers
  const dataStartRow = 14;
  const dataHeaders = [
    { label: "Load", col: 1 },
    { label: "Load ID", col: 2 },
    { label: "Metering", col: 3 },
    { label: "Meter Supplied", col: 4 },
    { label: "CT Rating in Dynamics", col: 5 },
    { label: "CT Rating in Mender", col: 6 },
    { label: "Date/Time of Meter Read", col: 7, color: "FF92D050" },
    { label: "Physical Meter Read", col: 8, color: "FF92D050" },
    { label: "Date/Time BG Cumulative", col: 9, color: "FFFFC000" },
    { label: "BG Cumulative value", col: 10, color: "FFFFC000" },
    { label: "Accuracy%", col: 11 },
    { label: "Comments", col: 12 },
  ];

  dataHeaders.forEach(({ label, col, color }) => {
    const cell = ws.getCell(dataStartRow, col);
    cell.value = label;
    cell.font = { bold: true, size: 10 };
    cell.alignment = { ...centerAlign, wrapText: true };
    cell.border = thinBorder;
    if (color) {
      cell.fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: color },
      };
    }
  });

  // Build a lookup from comparison data
  const compLookup = new Map<string, ComparisonExportRow>();
  if (comparisonData) {
    for (const c of comparisonData) {
      if (c.loadName) compLookup.set(c.loadName, c);
    }
  }

  // Data rows
  readings.forEach((reading, index) => {
    const row = dataStartRow + 1 + index;
    const comp = compLookup.get(reading.loadName);

    const setCellValue = (col: number, value: string | number | null) => {
      const cell = ws.getCell(row, col);
      cell.value = value ?? "";
      cell.alignment = centerAlign;
      cell.border = thinBorder;
      cell.font = { size: 10 };
    };

    setCellValue(1, reading.loadName);
    setCellValue(2, reading.loadId);
    setCellValue(3, "");
    setCellValue(4, "");
    setCellValue(5, reading.ctRating);
    setCellValue(6, "");
    setCellValue(7, reading.dateTime);
    setCellValue(8, reading.physicalMeterRead);
    setCellValue(9, comp?.bravegenDateTime ?? "");
    setCellValue(10, comp?.bravegenUsage ?? "");

    // Accuracy% = (J/H)*100 as a formula so user can edit values
    const accCell = ws.getCell(row, 11);
    const hRef = `H${row}`;
    const jRef = `J${row}`;
    accCell.value = { formula: `IF(OR(${hRef}="",${hRef}=0,${jRef}=""),"",${jRef}/${hRef}*100)` } as any;
    accCell.numFmt = '0.0"%"';
    accCell.alignment = centerAlign;
    accCell.border = thinBorder;
    accCell.font = { size: 10, bold: true };
    // Set initial conditional color based on pre-calculated value
    if (comp?.accuracy != null) {
      if (comp.accuracy >= 95 && comp.accuracy <= 105) {
        accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF92D050" } };
      } else if (comp.accuracy >= 90 && comp.accuracy <= 110) {
        accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFFF00" } };
      } else {
        accCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFF0000" } };
      }
    }

    setCellValue(12, "");

    // Green background for cols G, H
    [7, 8].forEach((col) => {
      ws.getCell(row, col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FF92D050" },
      };
    });

    // Orange background for cols I, J
    [9, 10].forEach((col) => {
      ws.getCell(row, col).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: "FFFFC000" },
      };
    });
  });

  // ─── Tab 2: Source Document Image ───
  if (sourceImageBase64 && sourceImageMime) {
    const imgSheet = workbook.addWorksheet("Source Document");
    const ext = sourceImageMime === "image/png" ? "png" : "jpeg";
    const imageId = workbook.addImage({
      base64: sourceImageBase64,
      extension: ext,
    });
    // Place the image starting at A1, spanning a large area
    imgSheet.addImage(imageId, {
      tl: { col: 0, row: 0 },
      ext: { width: 800, height: 1100 },
    });
    imgSheet.getColumn(1).width = 120;
  }

  // ─── Tab 3: BraveGen Raw Data ───
  if (bravegenRawData && bravegenRawData.length > 0) {
    const bgSheet = workbook.addWorksheet("BraveGen Data");
    const bgHeaders = ["Event", "Load/Channel Name", "Channel Key", "Reference", "Utility Type", "Unit", "Usage"];
    const bgHeaderRow = bgSheet.getRow(1);
    bgHeaders.forEach((h, i) => {
      const cell = bgHeaderRow.getCell(i + 1);
      cell.value = h;
      cell.font = { bold: true, size: 11 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
      cell.border = thinBorder;
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFD9E1F2" } };
    });
    bgSheet.columns = [
      { width: 22 }, { width: 28 }, { width: 18 }, { width: 20 }, { width: 16 }, { width: 10 }, { width: 14 },
    ];

    bravegenRawData.forEach((row, idx) => {
      const r = bgSheet.getRow(idx + 2);
      const values = [row.event, row.loadName, row.channelKey, row.reference, row.utilityType, row.unit, row.usage];
      values.forEach((v, i) => {
        const cell = r.getCell(i + 1);
        cell.value = v ?? "";
        cell.alignment = { horizontal: "center", vertical: "middle" };
        cell.border = thinBorder;
        cell.font = { size: 10 };
      });
    });
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
