import fs from "fs";
import os from "os";
import path from "path";
import { describe, it, expect, afterEach } from "vitest";
import {
  lookupLocalAddressInIndex,
  clearLocalAddressIndexCacheForTests,
  buildLocalAddressIndexMapFromString,
} from "../services/localAddressIndex.js";

describe("localAddressIndex — parse en memoria", () => {
  it("JSON: triple normalizado", () => {
    const map = buildLocalAddressIndexMapFromString(
      JSON.stringify([
        { localidad: "Hasenkamp", calle: "Doctor Haedo", numero: "365", lat: -31.5, lng: -58.2 },
      ]),
      ".json"
    );
    expect(map.get("hasenkamp|doctor haedo|365")).toEqual({ lat: -31.5, lng: -58.2 });
  });

  it("CSV con cabecera y comillas", () => {
    const csv =
      'localidad,calle,numero,lat,lng\n"Hasenkamp","Haedo",365,"-31,5","-58,2"\n';
    const map = buildLocalAddressIndexMapFromString(csv, ".csv");
    expect(map.get("hasenkamp|haedo|365")).toEqual({ lat: -31.5, lng: -58.2 });
  });

  it("sin número significativo → clave 0", () => {
    const map = buildLocalAddressIndexMapFromString(
      JSON.stringify([{ localidad: "X", calle: "Y", numero: "0", lat: 1, lng: 2 }]),
      ".json"
    );
    expect(map.get("x|y|0")).toEqual({ lat: 1, lng: 2 });
  });
});

describe("localAddressIndex — archivo vía env", () => {
  afterEach(() => {
    clearLocalAddressIndexCacheForTests();
    delete process.env.LOCAL_ADDRESS_INDEX_PATH;
  });

  it("lookupLocalAddressInIndex con path temporal", () => {
    const tmp = path.join(os.tmpdir(), `pmg-loc-idx-${Date.now()}.json`);
    fs.writeFileSync(
      tmp,
      JSON.stringify([{ localidad: "Rosario", calle: "Mitre", n: 100, latitude: -32.9, longitude: -60.7 }])
    );
    process.env.LOCAL_ADDRESS_INDEX_PATH = tmp;
    expect(lookupLocalAddressInIndex("Rosario", "Mitre", "100")).toEqual({ lat: -32.9, lng: -60.7 });
    expect(lookupLocalAddressInIndex("Rosario", "Mitre", "999")).toBeNull();
    fs.unlinkSync(tmp);
  });
});
