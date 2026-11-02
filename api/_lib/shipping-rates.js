/**
 * Official JNE Regular shipping rates from Jakarta Timur.
 * Single source of truth for server-side shipping validation.
 */
const PROVINCE_TO_CITY = {
  'DKI Jakarta': [
    { name: 'Jakarta Pusat', cost: 10000 },
    { name: 'Jakarta Utara', cost: 10000 },
    { name: 'Jakarta Barat', cost: 10000 },
    { name: 'Jakarta Selatan', cost: 10000 },
    { name: 'Jakarta Timur', cost: 10000 }
  ],
  'Banten': [
    { name: 'Kota Tangerang', cost: 11000 },
    { name: 'Kota Tangerang Selatan', cost: 11000 },
    { name: 'Kab. Tangerang', cost: 12000 },
    { name: 'Kota Serang', cost: 13000 }
  ],
  'Jawa Barat': [
    { name: 'Kota Bekasi', cost: 11000 },
    { name: 'Kota Depok', cost: 11000 },
    { name: 'Kota Bogor', cost: 12000 },
    { name: 'Kota Bandung', cost: 15000 },
    { name: 'Kab. Bandung', cost: 16000 },
    { name: 'Kota Cirebon', cost: 16000 }
  ],
  'Jawa Tengah': [
    { name: 'Kota Semarang', cost: 20000 },
    { name: 'Kota Surakarta (Solo)', cost: 20000 },
    { name: 'Kab. Banyumas', cost: 22000 }
  ],
  'Jawa Timur': [
    { name: 'Kota Surabaya', cost: 22000 },
    { name: 'Kota Malang', cost: 24000 },
    { name: 'Kab. Sidoarjo', cost: 24000 }
  ],
  'Luar Jawa': [
    { name: 'Kota Medan', cost: 38000 },
    { name: 'Kota Denpasar', cost: 35000 },
    { name: 'Kota Makassar', cost: 42000 },
    { name: 'Kota Balikpapan', cost: 45000 }
  ]
};

const CITY_LOOKUP = new Map();
const ALL_CITIES_SORTED = [];

for (const [province, cities] of Object.entries(PROVINCE_TO_CITY)) {
  for (const c of cities) {
    const entry = {
      province,
      city: c.name,
      cost: c.cost,
      cityLower: c.name.toLowerCase()
    };
    CITY_LOOKUP.set(entry.cityLower, entry);
    ALL_CITIES_SORTED.push(entry);
  }
}

// Sort longest city name first so "Kota Tangerang Selatan" matches before "Kota Tangerang"
ALL_CITIES_SORTED.sort((a, b) => b.cityLower.length - a.cityLower.length);

/**
 * Resolves and validates official shipping cost on the server.
 * Never trusts client-provided shipping price.
 */
function resolveShippingCost({ shipObj = {}, address = '', allPhotopack = false }) {
  if (allPhotopack) {
    return { ok: true, cost: 0, province: null, city: null };
  }

  const isCodEvent = shipObj.method === 'cod_event' || shipObj.id === 'cod_event';
  if (isCodEvent) {
    return { ok: true, cost: 0, province: null, city: null };
  }

  const rawCity = String(shipObj.city || '').trim();
  const rawProvince = String(shipObj.province || '').trim();

  if (rawCity) {
    const matched = CITY_LOOKUP.get(rawCity.toLowerCase());
    if (!matched) {
      return {
        ok: false,
        error: `Kota tujuan pengiriman "${rawCity}" tidak terdaftar dalam layanan pengiriman JNE.`
      };
    }
    if (rawProvince && matched.province.toLowerCase() !== rawProvince.toLowerCase()) {
      return {
        ok: false,
        error: `Kota "${matched.city}" tidak sesuai dengan provinsi "${rawProvince}".`
      };
    }
    return {
      ok: true,
      cost: matched.cost,
      province: matched.province,
      city: matched.city
    };
  }

  // Fallback for cached clients where city was appended to full address string
  const addrLower = String(address || '').toLowerCase();
  if (addrLower) {
    for (const entry of ALL_CITIES_SORTED) {
      if (addrLower.includes(entry.cityLower)) {
        return {
          ok: true,
          cost: entry.cost,
          province: entry.province,
          city: entry.city
        };
      }
    }
  }

  return {
    ok: false,
    error: 'Kota tujuan pengiriman JNE wajib dipilih dari daftar yang tersedia.'
  };
}

module.exports = {
  PROVINCE_TO_CITY,
  resolveShippingCost
};

