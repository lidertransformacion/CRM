export type SplitLocation = {
  client: string | null;
  address: string;
  city: string;
  citySource: "sheet" | "inferred" | "empty";
};

const SPLITS: Record<string, SplitLocation> = {
  "Hotel Cartagena Plaza de la Aduana Cartagena, barrio centro calle 32 4-45 zona plaza de la aduana": {
    client: "Hotel Cartagena Plaza de la Aduana",
    address: "Barrio centro, calle 32 4-45, zona plaza de la aduana",
    city: "Cartagena",
    citySource: "sheet",
  },
  "Libertario coffee Calle 122": {
    client: "Libertario Coffee",
    address: "Calle 122",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Sociedad Hotelera Chico Calle 90 # 11-13": {
    client: "Sociedad Hotelera Chico",
    address: "Calle 90 # 11-13",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Organic Baobab SAS Calle 82#8-85 Casa Baobab": {
    client: "Organic Baobab SAS",
    address: "Calle 82 #8-85 Casa Baobab",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Dekarla SAS Ac 116 #18b86": {
    client: "Dekarla SAS",
    address: "Ac 116 #18b86",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Dekarla SAS Calle 147 # 7-70": {
    client: "Dekarla SAS",
    address: "Calle 147 # 7-70",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Food Fans SAS Hotel GHL Cl. 93 # 11A - 31": {
    client: "Food Fans SAS",
    address: "Hotel GHL, Cl. 93 # 11A-31",
    city: "Bogotá",
    citySource: "inferred",
  },
  "La Artesa SAS CRA 35 #17A 61": {
    client: "La Artesa SAS",
    address: "CRA 35 #17A 61",
    city: "Bogotá",
    citySource: "inferred",
  },
  "La Artesa SAS Calle 109 #14B-16": {
    client: "La Artesa SAS",
    address: "Calle 109 #14B-16",
    city: "Bogotá",
    citySource: "inferred",
  },
  "La Artesa SAS AV. CRA 19 #139-06": {
    client: "La Artesa SAS",
    address: "AV. CRA 19 #139-06",
    city: "Bogotá",
    citySource: "inferred",
  },
  "La Artesa SAS Calle 138 #55-89": {
    client: "La Artesa SAS",
    address: "Calle 138 #55-89",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Cra 19 #134 - 20 Piso 6, Bogotá": {
    client: null,
    address: "Cra 19 #134-20 Piso 6",
    city: "Bogotá",
    citySource: "sheet",
  },
  "Cl. 120a #6a-53, Bogotá": {
    client: null,
    address: "Cl. 120a #6a-53",
    city: "Bogotá",
    citySource: "sheet",
  },
  "Terra Om Studio SAS Cra. 5 #119- 33, Usaquén": {
    client: "Terra Om Studio SAS",
    address: "Cra. 5 #119-33",
    city: "Usaquén",
    citySource: "sheet",
  },
  "Medios y Programas SAS Mercari Aeropuerto": {
    client: "Medios y Programas SAS",
    address: "Mercari Aeropuerto",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Puro Vino SAS Zona G Cra. 9 #70-55": {
    client: "Puro Vino SAS",
    address: "Zona G, Cra. 9 #70-55",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Food Fans SAS Carrera 11 # 98- 07 local C8": {
    client: "Food Fans SAS",
    address: "Carrera 11 # 98-07 local C8",
    city: "Bogotá",
    citySource: "inferred",
  },
  "Hoteles Estelar - Intercontinental Cali Avenida Colombia #2-72": {
    client: "Hoteles Estelar",
    address: "Intercontinental, Avenida Colombia #2-72",
    city: "Cali",
    citySource: "sheet",
  },
};

export function normalizeLocation(raw: string | null | undefined): string {
  return (raw ?? "").replace(/\s+/g, " ").trim();
}

export function splitLocation(raw: string | null | undefined): SplitLocation {
  const key = normalizeLocation(raw);
  if (!key) return { client: null, address: "", city: "", citySource: "empty" };
  const known = SPLITS[key];
  if (known) return known;
  return { client: null, address: key, city: "", citySource: "empty" };
}

export function knownClients(): string[] {
  return [...new Set(Object.values(SPLITS).map((row) => row.client).filter((name): name is string => !!name))].sort((a, b) =>
    a.localeCompare(b, "es"),
  );
}

export function composeLocation(client: string | null, address: string, city: string): string {
  return [client, address, city].map((part) => part?.trim() ?? "").filter(Boolean).join(" · ");
}
