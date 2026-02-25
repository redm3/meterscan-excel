export interface MeterReading {
  id: string;
  loadName: string;
  loadId: number | null;
  ctRating: string | null;
  dateTime: string | null;
  physicalMeterRead: number | null;
  ph1Amps: number | null;
  ph2Amps: number | null;
  ph3Amps: number | null;
  voltage: number | null;
  pf: number | null;
}

export interface ExportSettings {
  siteName: string;
  buildingName: string;
  feedName: string;
  serialNumber: string;
}

export interface ValidationExportData {
  loggerReading1: number;
  loggerReading2: number;
  loggerDateTime1: string;
  loggerDateTime2: string;
  refReading1: number;
  refReading2: number;
  refDateTime1: string;
  refDateTime2: string;
  multiplier: number;
  loggerDiff: number;
  refDiff: number;
  actualKwh: number;
  accuracy: number;
  retailSerialNumber: string;
}

export interface ComparisonExportRow {
  loadName: string;
  dateTime: string | null;
  physicalMeterRead: number | null;
  bravegenDateTime: string | null;
  bravegenUsage: number | null;
  accuracy: number | null;
}
