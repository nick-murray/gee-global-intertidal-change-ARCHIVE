/**
 * Tidal wetland change type
 */

var tw_change = 'foo' // path to tw_change image
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);
var classList = [2,3,5]; 

var globOptions = { 
  outScale: 30, 
  covariatePath: 'foo', // Covariates path
  trainingDataID:'foo',  // Training data path
  dateGenerated: ee.Date(Date.now())
}

var covariateLoader = function(covariateCode, yearString){
  var assetPath = globOptions.covariatePath 
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat(globOptions.version);
  var im = ee.Image(assetPath);
  return im;
};

// covariates 
var trainComposite_t1 = covariateLoader('awe', '19992001')
        .addBands (covariateLoader('evi', '19992001'))
        .addBands (covariateLoader('gre_1090', '19992001'))
        .addBands (covariateLoader('mnd', '19992001'))
        .addBands (covariateLoader('ndv', '19992001'))
        .addBands (covariateLoader('ndw', '19992001'))
        .addBands (covariateLoader('nir_1090', '19992001')) 
        .addBands (covariateLoader('swi_1090', '19992001'))
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_abs_latitude_v2_0')) 
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_alosTerrain_2006_v2_0'))
        .addBands (covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']));
        
var trainComposite_t2 = covariateLoader('awe', '20172019')
        .addBands (covariateLoader('evi', '20172019'))
        .addBands (covariateLoader('gre_1090', '20172019'))
        .addBands (covariateLoader('mnd', '20172019'))
        .addBands (covariateLoader('ndv', '20172019'))
        .addBands (covariateLoader('ndw', '20172019'))
        .addBands (covariateLoader('nir_1090', '20172019')) 
        .addBands (covariateLoader('swi_1090', '20172019'))
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_abs_latitude_v2_0')) 
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_alosTerrain_2006_v2_0'))
        .addBands (covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']));

var bands_t1 = trainComposite_t1.bandNames();

var bands_t2 = trainComposite_t2.bandNames();

var train_Dat = globOptions.trainingDataID
  .filter(ee.Filter.inList('CLASS', classList)) 
  .distinct('.geo') 
  .distinct('awe_0010')
  .filter(ee.Filter.neq('awe_min', null))
  .filter(ee.Filter.neq('latitude', null))
  .filter(ee.Filter.neq('slope', null))
  .randomColumn('random',1)
  .sort('random');

var mudflat_no = ee.Number(train_Dat.filterMetadata('CLASS', 'equals',2).size());
var saltmarsh_no = ee.Number(train_Dat.filterMetadata('CLASS', 'equals',5).size());
var mangrove_no = train_Dat.filterMetadata('CLASS', 'equals',3).size();
var minClass = mudflat_no.min(mangrove_no).min(saltmarsh_no);
var train_Dat2 = train_Dat
  .filterMetadata('CLASS', 'equals',2).limit(minClass)
  .merge(train_Dat
    .filterMetadata('CLASS', 'equals',5).limit(minClass))
    .merge(train_Dat
      .filterMetadata('CLASS', 'equals',3).limit(minClass));

var s3classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 450, 
    minLeafPopulation:3, //min.node.size
    variablesPerSplit: 20, // 0 is the default: sqrt of nPredictors 
    bagFraction: 0.8,
    seed: 0})
  .train(stage2TrainingSetBalance, 'CLASS', bandsStage2)
  .setOutputMode('CLASSIFICATION');

var type_t1 = trainComposite_t1
  .select(bands_t1)
  .updateMask(tw_change.select(['loss'])) //work only in loss patches
  .classify(s3classifier)
  .rename('lossType')

var type_t2 = trainComposite_t2
  .select(bands_t2)
  .updateMask(tw_change.select(['gain'])) 
  .classify(s3classifier)
  .rename('gainType')

// compile into single image
var gic_final =  tw_change
  .addBands(type_t1)
  .addBands(type_t2);

// File naming
var assetName = 'foo'; // path and asset name

// Export
Export.image.toAsset({
  image: gic_final, 
  description: 'export_gic_final',
  assetId: assetName,
  scale: globOptions.outScale,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});