const imageFilenames = [
  "-100.43416595458984_30.96549415588379_predicted_mask.png",
  "-100.43416595458984_30.96549415588379_probabilites.png",
  "-100.5384292602539_30.70906639099121_predicted_mask.png",
  "-100.5384292602539_30.70906639099121_probabilites.png",
  "-100.9358901977539_33.61058807373047_predicted_mask.png",
  "-100.9358901977539_33.61058807373047_probabilites.png",
  "-101.06040954589844_34.657562255859375_predicted_mask.png",
  "-101.06040954589844_34.657562255859375_probabilites.png",
  "-101.1233901977539_32.19962692260742_predicted_mask.png",
  "-101.1233901977539_32.19962692260742_probabilites.png",
];

function getRandomUncertainty() {
  return +(Math.random() * 0.5 + 0.1).toFixed(3); // 0.1 to 0.6
}

const generatedFeatures = imageFilenames.map(filename => {
  const match = filename.match(/^(-?\d+\.\d+)_(-?\d+\.\d+)_/);
  if (!match) return null;
  const lon = parseFloat(match[1]);
  const lat = parseFloat(match[2]);
  return {
    type: "Feature" as const,
    properties: {
      filename,
      uncertainty: getRandomUncertainty(),
    },
    geometry: {
      type: "Point" as const,
      coordinates: [lon, lat],
    },
  };
}).filter(Boolean);

const generatedGeojson = {
  type: "FeatureCollection" as const,
  features: generatedFeatures,
};

export default generatedGeojson;
