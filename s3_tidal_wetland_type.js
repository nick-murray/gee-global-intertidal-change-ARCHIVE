/****************************************** 
* Stage 1 classifier - extent
/******************************************/


/********************************* 
* 0. Global Variables / Options
*********************************/

var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);
var classList = [0,1,2,3,5,6,7]; // <-- CHOOSE MAP CLASSES TO MODEL: 'Land (0), Water (1), Tidal Flat (2), Mangrove (3), Saltmarsh (5), Seagrass (6),Ponds (7)'

var globOptions = { 
  startDate: '2017-01-01',
  endDate: '2019-12-31',
  outScale: 30, 
  probabilityThreshold: 50,
  covariatePath: 'projects/UQ_intertidal/covariate_layers/L3_', //for the rest
  landsatCollection: 'C01/T1_SR',
  trainingDataID:'projects/UQ_intertidal/global_intertidal_v2_0/covariateLibraries/git_covariateLibrary_MASTER_v2_0_14', 
  dateGenerated: ee.Date(Date.now()),
  classLabelList: ['Land', 'Water', 'Tidal Flat', 'Mangrove', 'Saltmarsh', 'Seagrass', 'Aquaculture'],
  classValueList: [0,1,2,3,5,6,7],
  classLabelString: 'Land (0), Water (1), Tidal Flat (2), Mangrove (3), Saltmarsh (5), Seagrass (6), Aquaculture (7)'
}

var yearString = globOptions.startDate.slice(0,4)
  .concat(globOptions.endDate.slice(0,4));

/*********************************
* 1. Functions
*********************************/

var covariateLoader = function(covariateCode){
  var assetPath = globOptions.covariatePath
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat(globOptions.version);
  var im = ee.Image(assetPath);
  return im;
};


/*********************************
* 2. Data Imports & Processing
*********************************/

var covariateLibrary = ee.FeatureCollection(globOptions.trainingDataID);

// covariates 
var trainComposite = covariateLoader('awe')
        .addBands (covariateLoader('evi'))
        .addBands (covariateLoader('gre_1090'))
        .addBands (covariateLoader('mnd'))
        .addBands (covariateLoader('ndv'))
        .addBands (covariateLoader('ndw'))
        .addBands (covariateLoader('nir_1090')) 
        .addBands (covariateLoader('swi_1090'))
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_abs_latitude_v2_0')) 
        .addBands(ee.Image('projects/UQ_intertidal/covariate_layers/L3_alosTerrain_2006_v2_0'))
        .addBands (covariateLoader('minTemp').select(['minimum_2m_air_temperature'],['minTemp']));
        
var bands = trainComposite.bandNames();

// /*********************************
// // 3. Training Data
// *********************************/

var trainingSetRaw = covariateLibrary
  .distinct('.geo') // remove spatial duplicates
  .distinct('awe_0010') // remove other duplicates
  .filter(ee.Filter.neq('awe_min', null))
  .filter(ee.Filter.neq('latitude', null))
  .filter(ee.Filter.neq('slope', null))
  .randomColumn('random',1) //add random number //v200 to v202 were seed 1. Now trying seed 2 to see what happens to mangroves in Norfolk. 
  .sort('random'); // randomly mix order


// /*********************************
// * 4. STAGE 1 Classifier: Coastal Wetland or Not
// *********************************/

// Stage 1 Options
var ClassA = [0,1,6,7]; // non tidal wetland
var ClassB = [2,3,5]; // mudflat, saltmarsh, mangrove

var bandsStage1 = bands;
var s1Set = trainingSetRaw;

// Stage 1: Recode to binary coastal wetland/not coastal wetland
var trainingPoints0 = s1Set.filter(ee.Filter.inList('CLASS', ClassA))
  .map(function(feat){
    // Target Class: Other
    return feat.set({'CLASS':0});
  });
  
var trainingPoints1 = s1Set.filter(ee.Filter.inList('CLASS', ClassB))
  .map(function(feat){
    // Target Class: Coastal wetland (saltmarsh, mudflat or mangrove)
    return feat.set({'CLASS':1});
  });

// Balance classes
var Stage1TrainingPoints = trainingPoints1.limit(17772) // size per class is now limited to smallest class
  .merge(trainingPoints0); 

print ('S1 nPoints Other:',Stage1TrainingPoints.filterMetadata('CLASS', 'equals',0).size());
print ('S1 nPoints CoastalWetland:',Stage1TrainingPoints.filterMetadata('CLASS', 'equals',1).size());

// Stage 1 top model tuning in ranger (mean of top 5 models)
var s1classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 350, 
    minLeafPopulation:2, 
    variablesPerSplit: 19, 
    bagFraction: 0.7,
    seed: 0})
  .train(Stage1TrainingPoints, 'CLASS', bandsStage1)
  .setOutputMode('PROBABILITY');

// Classify the composite image
var stage1ClassifiedProb = trainComposite.select(bandsStage1)
  .classify(s1classifier)
  .rename('gic_s1_probability')
  .multiply(100)
  .round()
  .uint8();
var stage1Classified = stage1ClassifiedProb.gte(globOptions.probabilityThreshold).selfMask(); // Uncomment this if running in probability mode // CONSIDER ROC TO DETERMINE THRESHOLD

/*********************************
* 5. STAGE 2 Classifier: Saltmarsh or mangrove?
*********************************/

var bandsStage2 = bands;
var s2Set = trainingSetRaw;
var mfSize = ee.Number(s2Set.filterMetadata('CLASS', 'equals',2).size());
var smSize = ee.Number(s2Set.filterMetadata('CLASS', 'equals',5).size());
var manSize = s2Set.filterMetadata('CLASS', 'equals',3).size();

// Set up training set for Stage 2
// Balance training set
print ('S2 nPoints Mudflat:', mfSize); //4692
print ('S2 nPoints Saltmarsh:', smSize); //5858
print ('S2 nPoints Mangrove:', manSize); //12657

var minClass = mfSize.min(manSize).min(smSize);
print ('*** Minimum Class Stage 2***', minClass); // 4692 points per class

var stage2TrainingSetBalance = s2Set
  .filterMetadata('CLASS', 'equals',2).limit(minClass)
  .merge(s2Set
    .filterMetadata('CLASS', 'equals',5).limit(minClass))
    .merge(s2Set
      .filterMetadata('CLASS', 'equals',3).limit(minClass));


// Stage 2 top model tuning in ranger (mean of top 5 models)
// https://github.com/nick-murray/global-intertidal-change-DECRA/blob/fa9a957f94213206ca54a7404f1a718e5d8c8f4b/code/R/modelTuning_v3_Final.R
var s2classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 450, 
    minLeafPopulation:3, //min.node.size
    variablesPerSplit: 20, // 0 is the default: sqrt of nPredictors 
    bagFraction: 0.8,
    seed: 0})
  .train(stage2TrainingSetBalance, 'CLASS', bandsStage2)
  .setOutputMode('CLASSIFICATION');

// Classify the composite image
var gicRaw = trainComposite.updateMask(stage1Classified)
  .select(bandsStage2)
  .classify(s2classifier)
  .rename('gic_s2_classification');

/*********************************
 *7. Export to Asset.
 *********************************/
 
var vars = {
  s1outOfBagErrorEstimate:s1classifier.explain().get('outOfBagErrorEstimate'),
  s2outOfBagErrorEstimate: s2classifier.explain().get('outOfBagErrorEstimate')
};
//print(vars);

// compile into single image
var finalOut =  stage1ClassifiedProb
    .addBands(gicRaw)
    .set(globOptions)
    .set(vars);
//Map.addLayer (finalOut.select([0]),{palette:globOptions.plasmaPalette, min:0, max:100}, 'gic_s1_probability', true, 0.7);
//Map.addLayer (finalOut.select([1]),{min: 0, max: 5, palette: globOptions.classPalette}, 'gic_s2_classification', true, 0.7);


// File naming
var fileName = 'L1_gic_'
  .concat(globOptions.startDate.slice(0,4))
  .concat('')
  .concat(globOptions.endDate.slice(0,4))
  .concat('_')
  .concat(globOptions.subversion)
  .concat('_')
  .concat(quad);

var assetName = 'projects/UQ_intertidal/global_intertidal_v2_0/outputs/gic_v2_0/L1_quads/'
  .concat(fileName);

// Export
Export.image.toAsset({
  image: finalOut, 
  description: 'export_'.concat(fileName),
  assetId: assetName,
  scale: globOptions.outScale,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});