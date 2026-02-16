import ExcelJS from "exceljs";
import { MeterReading, ExportSettings } from "@/types/meter";

export async function generateValidationExcel(
  readings: MeterReading[],
  settings: ExportSettings
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

  // Rows 4-7: Info fields
  ws.getCell("A4").value = "Feed:";
  ws.getCell("B4").value = settings.feedName;
  ws.getCell("A5").value = "SN:";
  ws.getCell("B5").value = settings.serialNumber;
  ws.getCell("A6").value = "Site:";
  ws.getCell("B6").value = settings.siteName;
  ws.getCell("A7").value = "Building:";
  ws.getCell("B7").value = settings.buildingName;

  for (let r = 4; r <= 7; r++) {
    ws.getCell(`A${r}`).font = { bold: true };
  }

  // Row 9: Main Incomer header (yellow)
  ws.mergeCells("A9:K9");
  const incomerHeader = ws.getCell("A9");
  incomerHeader.value = "Main Incomer";
  incomerHeader.font = { bold: true, size: 12 };
  incomerHeader.alignment = centerAlign;
  incomerHeader.fill = {
    type: "pattern",
    pattern: "solid",
    fgColor: { argb: "FFFFFF00" },
  };

  // Row 11: Main incomer metering sub-headers
  const row11Labels = ["ICP", `Meter SN`, "DateTime", "Reading", "Main Incomer DateTime", "Main Incomer Reading", "kWh"];
  row11Labels.forEach((label, i) => {
    const cell = ws.getCell(11, i + 1);
    cell.value = label;
    cell.font = headerFont;
    cell.alignment = centerAlign;
    cell.border = thinBorder;
  });

  // Row 16: Multiplier / Diff
  ws.getCell("A16").value = "Multiplier";
  ws.getCell("B16").value = 1;
  ws.getCell("D16").value = "Diff";
  ws.getCell("E16").value = 0;

  // Row 17: Convert to Actual kWh
  ws.getCell("A17").value = "Convert to Actual kWh";
  ws.getCell("B17").value = 0;
  ws.getCell("D17").value = "Accuracy%";
  ws.getCell("E17").value = "#DIV/0!";

  // Row 20: Data table headers
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
    const cell = ws.getCell(20, col);
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

  // Data rows starting at 21
  readings.forEach((reading, index) => {
    const row = 21 + index;
    const setCellValue = (col: number, value: string | number | null) => {
      const cell = ws.getCell(row, col);
      cell.value = value ?? "";
      cell.alignment = centerAlign;
      cell.border = thinBorder;
      cell.font = { size: 10 };
    };

    setCellValue(1, reading.loadName);
    setCellValue(2, reading.loadId);
    setCellValue(3, ""); // Metering
    setCellValue(4, ""); // Meter Supplied
    setCellValue(5, reading.ctRating);
    setCellValue(6, ""); // CT Rating in Mender
    setCellValue(7, reading.dateTime);
    setCellValue(8, reading.physicalMeterRead);
    setCellValue(9, ""); // Date/Time BG
    setCellValue(10, ""); // BG Cumulative
    setCellValue(11, ""); // Accuracy%
    setCellValue(12, ""); // Comments

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

  const buffer = await workbook.xlsx.writeBuffer();
  return new Blob([buffer], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  });
}
