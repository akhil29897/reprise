// Planned camera profiles. A listing is not a verified repair claim.
export const catalog = [
  {
    name: "Sony Alpha & ZV",
    category: "Mirrorless",
    models:
      "a1 · a7 / a7S / a7R · a9 · a6000 series · a6700 · ZV-E1 · ZV-E10 · RX",
    formats: ["MP4", "RSV", "XAVC S", "XAVC S-I", "XAVC HS"],
    note: "Separate H.264 and H.265 recording modes. RSV reference reconstruction remains experimental.",
  },
  {
    name: "Sony Cinema Line",
    category: "Cinema",
    models: "FX3 · FX30 · FX6 · FX9 · FS5 · FS7 · VENICE · XDCAM · Handycam",
    formats: ["MP4", "MXF", "RSV", "XAVC", "AVCHD"],
    note: "Not every model uses RSV. Camera, firmware, codec, and audio layout need separate fixtures.",
  },
  {
    name: "Canon EOS",
    category: "Mirrorless",
    models:
      "EOS R5 · R5 C · R6 family · EOS R series · 5D · 6D · 7D · PowerShot",
    formats: ["MP4", "MOV", "H.264", "HEVC", "DAT"],
    note: "Identify the actual recording layout before choosing repair or reference reconstruction.",
  },
  {
    name: "Canon Cinema EOS",
    category: "Cinema",
    models: "C50 · C70 · C80 · C200 · C300 · C400 · C500 · XF · XA families",
    formats: ["MP4", "MXF", "XF-AVC", "XF-HEVC", "CRM"],
    note: "Cinema RAW and broadcast files require dedicated format research.",
  },
  {
    name: "Panasonic LUMIX",
    category: "Mirrorless",
    models:
      "GH4 · GH5 · GH5S · GH6 · GH7 · S1 · S1H · S5 · S5II · S5IIX · BGH1 · BS1H",
    formats: ["MOV", "MP4", "MDT", "ProRes", "AVCHD"],
    note: "Unfinished MDT recordings and each intra/long-GOP mode need distinct tests.",
  },
  {
    name: "Panasonic Professional",
    category: "Cinema",
    models: "EVA1 · VariCam · AG · AJ camcorder families",
    formats: ["MXF", "MOV", "AVC-Intra", "DVCPRO"],
    note: "Preserve timecode, spanned clips, and multichannel audio where the engine can verify them.",
  },
  {
    name: "Nikon",
    category: "Mirrorless",
    models: "Z6 · Z7 · Z8 · Z9 · ZR · D750 · D850 · Z / DSLR families",
    formats: ["MOV", "MP4", "NEV", "N-RAW", "ProRes RAW"],
    note: "External recorder files use the recorder’s profile, not just the camera model.",
  },
  {
    name: "Fujifilm",
    category: "Mirrorless",
    models: "X-H2 · X-H2S · X-T4 · X-T5 · X-S10 · X-S20 · GFX video families",
    formats: ["MOV", "MP4", "H.264", "HEVC", "ProRes"],
    note: "Log, audio, frame-rate, and recording codec settings belong in the sample profile.",
  },
  {
    name: "Other hybrid cameras",
    category: "Mirrorless",
    models: "OM System / Olympus · Leica · Sigma · Pentax / Ricoh",
    formats: ["MOV", "MP4", "AVI"],
    note: "Generic container inspection works without a model selection. Model-specific repairs are planned.",
  },
  {
    name: "Blackmagic Design",
    category: "Cinema",
    models:
      "Pocket 4K / 6K · Cinema Camera · PYXIS · URSA Mini / Pro / Cine · Micro",
    formats: ["BRAW", "MOV", "ProRes", "CinemaDNG"],
    note: "Proprietary RAW repair is a separate research track, not inferred from ordinary MOV support.",
  },
  {
    name: "RED",
    category: "Cinema",
    models: "KOMODO · KOMODO-X · V-RAPTOR · DSMC / DSMC2 · RED ONE",
    formats: ["R3D", "MOV", "ProRes"],
    note: "R3D reconstruction and validation need their own engine and licensed test recordings.",
  },
  {
    name: "ARRI",
    category: "Cinema",
    models: "ALEXA Classic · Mini · LF · Mini LF · 35 · AMIRA",
    formats: ["ARRIRAW", "MXF", "ProRes", "MOV"],
    note: "Keep sensor/recording modes, timecode, and image metadata distinct in testing.",
  },
  {
    name: "Z CAM & Kinefinity",
    category: "Cinema",
    models: "E2 families · Kinefinity cinema families",
    formats: ["MOV", "MP4", "ProRes", "RAW"],
    note: "Device-specific profiles are planned as authorized fixtures become available.",
  },
  {
    name: "GoPro",
    category: "Action & 360",
    models: "HERO · Session · Fusion · MAX",
    formats: ["MP4", "LRV", "360", "H.264", "HEVC"],
    note: "Chapter splits, proxies, telemetry, and spherical metadata need independent preservation checks.",
  },
  {
    name: "Insta360",
    category: "Action & 360",
    models: "ONE · ONE X · ONE R · ONE RS · X series · Ace · GO · Pro · Titan",
    formats: ["INSV", "MP4", "360"],
    note: "Lens pairs and stitching metadata cannot be replaced by a flat video preview.",
  },
  {
    name: "DJI handheld",
    category: "Action & 360",
    models: "Osmo Action · Osmo Pocket · Osmo 360 · Ronin 4D",
    formats: ["MP4", "MOV", "LRF", "ProRes"],
    note: "Inspect actual camera module and recording mode; preserve matching sidecars.",
  },
  {
    name: "DJI drones",
    category: "Drone",
    models: "Mavic · Mini · Air · Phantom · Inspire · Avata · FPV",
    formats: ["MP4", "MOV", "CinemaDNG", "ProRes"],
    note: "Camera, proxy, and segmented-recording relationships require model-specific samples.",
  },
  {
    name: "Other action & aerial",
    category: "Drone",
    models: "Autel · Skydio · YI · AKASO · Garmin VIRB · Kandao · Ricoh THETA",
    formats: ["MP4", "MOV", "360"],
    note: "Generic repair first; specialized formats and camera metadata are planned.",
  },
  {
    name: "Apple iPhone & iPad",
    category: "Phone & capture",
    models: "iPhone / iPad Camera · Voice Memos · third-party recording apps",
    formats: ["MOV", "MP4", "M4A", "CAF", "HEVC", "ProRes"],
    note: "Track the recording app, iOS version, variable frame rate, HDR, and spatial-video mode.",
  },
  {
    name: "Android devices",
    category: "Phone & capture",
    models:
      "Samsung Galaxy · Google Pixel · Sony Xperia · Xiaomi · OnePlus · Oppo · Vivo · Huawei",
    formats: ["MP4", "3GP", "M4A", "AAC", "AMR"],
    note: "The app and OS version can change the file layout even on the same device.",
  },
  {
    name: "External video recorders",
    category: "Recorder",
    models:
      "Atomos Ninja / Shogun / Sumo · Blackmagic Video Assist / HyperDeck · AJA Ki Pro",
    formats: ["MOV", "MXF", "ProRes", "DNxHD", "DNxHR", "RAW"],
    note: "Use the recorder model, firmware and codec when choosing a matching reference.",
  },
  {
    name: "Field audio recorders",
    category: "Audio",
    models:
      "Zoom H / F · Tascam DR / Portacapture / FR-AV · Sound Devices MixPre / 6 / 8 Series",
    formats: ["WAV", "BWF", "RF64", "PCM", "32-bit float"],
    note: "Protect channel order, timecode, iXML and split-file relationships. Model validation is planned.",
  },
  {
    name: "Wireless & voice recorders",
    category: "Audio",
    models: "RØDE · DJI Mic · Tentacle · Deity · Sony PCM / ICD · Olympus / OM",
    formats: ["WAV", "MP3", "AAC", "32-bit float"],
    note: "Browser PCM WAV length repair is tested synthetically; recorder-specific interrupted files are not yet verified.",
  },
  {
    name: "Music & podcast recordings",
    category: "Audio",
    models:
      "DAW exports · audio interfaces · podcast apps · screen and voice recorders",
    formats: ["WAV", "AIFF", "CAF", "MP3", "M4A", "FLAC", "Ogg", "Opus"],
    note: "Audio restoration, denoising and generated replacement sound are different from file repair.",
  },
  {
    name: "Security & dash cameras",
    category: "Security",
    models:
      "Hikvision · Dahua · Axis · Hanwha · Reolink · Viofo · BlackVue · Thinkware · Nextbase · Garmin · Tesla · Axon",
    formats: ["MP4", "AVI", "TS", "DAT", "Proprietary"],
    note: "Start with authorized standard exports. Encryption or proprietary layouts may be unsupported.",
  },
  {
    name: "Webcams & screen capture",
    category: "Phone & capture",
    models:
      "Logitech · Elgato · AVerMedia · OBS · QuickTime · Zoom · Teams · MediaRecorder",
    formats: ["MP4", "MOV", "MKV", "WebM", "TS"],
    note: "Recording software and its settings usually determine the file structure.",
  },
];
export function searchCatalog(query = "", category = "all") {
  const q = query.trim().toLowerCase();
  return catalog.filter(
    (x) =>
      (category === "all" || x.category === category) &&
      `${x.name} ${x.models} ${x.formats.join(" ")} ${x.note}`
        .toLowerCase()
        .includes(q),
  );
}
