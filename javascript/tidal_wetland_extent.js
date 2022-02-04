/**
 * Global tidal wetland extent model.
 */

var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);

var classList = [0,1,2,3,5,6,7]; // <-- CHOOSE MAP CLASSES TO MODEL: 'Land (0), Water (1), Tidal Flat (2), Mangrove (3), Saltmarsh (5), Seagrass (6),Ponds (7)'

var globOptions = { 
  startDate: '2017-01-01',
  endDate: '2019-12-31',
  outScale: 30, 
  probabilityThreshold: 50,
  covariatePath: 'foo', // Covariates path
  landsatCollection: 'C01/T1_SR',
  trainingDataID:'foo',  // Training data path
  dateGenerated: ee.Date(Date.now()),
  classLabelList: ['Land', 'Water', 'Tidal Flat', 'Mangrove', 'Saltmarsh', 'Seagrass', 'Aquaculture'],
  classValueList: [0,1,2,3,5,6,7],
  classLabelString: 'Land (0), Water (1), Tidal Flat (2), Mangrove (3), Saltmarsh (5), Seagrass (6), Aquaculture (7)'
}

var yearString = globOptions.startDate.slice(0,4)
  .concat(globOptions.endDate.slice(0,4));

var covariateLoader = function(covariateCode){
  // load covariates
  var assetPath = globOptions.covariatePath
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat(globOptions.version);
  var im = ee.Image(assetPath);
  return im;
};

var trainComposite = covariateLoader('awe')
        .addBands (covariateLoader('evi'))
        .addBands (covariateLoader('gre_1090'))
        .addBands (covariateLoader('mnd'))
        .addBands (covariateLoader('ndv'))
        .addBands (covariateLoader('ndw'))
        .addBands (covariateLoader('nir_1090')) 
        .addBands (covariateLoader('swi_1090'))
        .addBands(ee.Image(globOptions.covariatePath.concat('abs_latitude_v2_0'))) 
        .addBands(ee.Image(globOptions.covariatePath.concat('alosTerrain_2006')))
        .addBands (covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']));
        
var bands = trainComposite.bandNames();

var covariateLibrary = ee.FeatureCollection(globOptions.trainingDataID);

var trainingLibrary = covariateLibrary
  .distinct('.geo') 
  .distinct('awe_0010')
  .filter(ee.Filter.neq('awe_min', null))
  .filter(ee.Filter.neq('latitude', null))
  .filter(ee.Filter.neq('slope', null))
  .randomColumn('random',1) 
  .sort('random'); 

// Stage 1 Classifier Options
var class_other = [0,1,6,7]; // non tidal wetland

var class_tw = [2,3,5]; // mudflat, saltmarsh, mangrove

var trainDat_other = trainingLibrary.filter(ee.Filter.inList('CLASS', class_other))
  .map(function(feat){
    // Target Class: Other
    return feat.set({'CLASS':0});
  });
  
var trainDat_tw = trainingLibrary.filter(ee.Filter.inList('CLASS', class_tw))
  .map(function(feat){
    // Target Class: Coastal wetland (saltmarsh, mudflat or mangrove)
    return feat.set({'CLASS':1});
  });

// Balance classes
var trainDat = trainDat_tw.limit(17772) 
  .merge(trainDat_other); 

// classifier
var s1classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 350, 
    minLeafPopulation:2, 
    variablesPerSplit: 19, 
    bagFraction: 0.7,
    seed: 0})
  .train(trainDat, 'CLASS', bands)
  .setOutputMode('PROBABILITY');

// Classify the composite image
var tw_probability = trainComposite.select(bands)
  .classify(s1classifier)
  .rename('gic_s1_probability')
  .multiply(100)
  .round()
  .uint8();
var tw_classification = tw_probability.gte(globOptions.probabilityThreshold).selfMask();

// Package for export
var tw_export = tw_probability
  .addBands(tw_classification.rename('gic_s1_classification'));

// File naming
var assetName = 'foo'; // path and asset name

// Export
Export.image.toAsset({
  image: tw_export, 
  description: 'export_s1',
  assetId: assetName,
  scale: globOptions.outScale,
  region: site,
  maxPixels: 1000000000000
});