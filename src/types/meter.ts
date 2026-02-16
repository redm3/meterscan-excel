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
