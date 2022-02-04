/**
 * Classify change flags as loss, gain or stable.
 */

var changeFlagImage = ee.Image('foo'); // path to changeFlag_pp2
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  
var gic2001 = ee.Image('foo'), // import post-processed tw_export (pp)
    gic2004 = ee.Image('foo'),
    gic2007 = ee.Image('foo'),
    gic2010 = ee.Image('foo'),
    gic2013 = ee.Image('foo'),
    gic2016 = ee.Image('foo'),
    gic2019 = ee.Image('foo');
var covariatePath = 'foo', // path to covariates folder
var trainingSet = 'foo' // path to loss/gain/stable training data

// Single image from change Flag
var changeFlag = changeFlagImage
  .select(['loss'])
  .unmask()
  .add(changeFlagImage
    .select(['gain'])
    .unmask())
  .gte(1)
  .selfMask();

var covariateLoader = function(covariateCode, yearString){
  var assetPath = covariatePath 
    .concat(covariateCode)
    .concat('_')
    .concat(yearString)
    .concat('_')
    .concat(globOptions.version);
  var im = ee.Image(assetPath);
  return im;
};

function samplePredictors(feature) {
    // sample covariates
    var predictorData = covariateComposite.reduceRegion({
    reducer: ee.Reducer.first(), 
    geometry: feature.geometry(),
    scale: 1}); 
    return feature.set(predictorData);
 }

// Develop the linear fit layer
var s1_probCollection = ee.ImageCollection([
    gic2001.select([0]).addBands(ee.Image(1).int()), 
    gic2004.select([0]).addBands(ee.Image(2).int()),
    gic2007.select([0]).addBands(ee.Image(3).int()),
    gic2010.select([0]).addBands(ee.Image(4).int()),
    gic2013.select([0]).addBands(ee.Image(5).int()),
    gic2016.select([0]).addBands(ee.Image(6).int()),
    gic2019.select([0]).addBands(ee.Image(7).int())
    ]);
    
var linearFit = s1_probCollection.reduce(ee.Reducer.linearFit());

var fitTrend = linearFit.select('scale'); // trend

var covariateComposite = covariateLoader('awe', '20172019').subtract(covariateLoader('awe', '19992001'))
        .addBands (covariateLoader('evi', '20172019').subtract(covariateLoader('evi', '19992001')))
        .addBands (covariateLoader('gre_1090', '20172019').subtract(covariateLoader('gre_1090', '19992001')))
        .addBands (covariateLoader('mnd', '20172019').subtract(covariateLoader('mnd', '19992001')))
        .addBands (covariateLoader('ndv', '20172019').subtract(covariateLoader('ndv', '19992001')))
        .addBands (covariateLoader('ndw', '20172019').subtract(covariateLoader('ndw', '19992001')))
        .addBands (covariateLoader('nir_1090', '20172019').subtract(covariateLoader('nir_1090', '19992001'))) 
        .addBands (covariateLoader('swi_1090', '20172019').subtract(covariateLoader('swi_1090', '19992001')))
        .addBands(fitTrend);
        
var bands = covariateComposite.bandNames();


var predictorSet = trainingSet.map(samplePredictors)
  .distinct('.geo') 
  .distinct('awe_0010') 
  .filter(ee.Filter.neq('awe_min', null))
  .randomColumn('random',1)
  .sort('random'); 

var classifier = ee.Classifier.smileRandomForest({
    numberOfTrees: 500, 
    minLeafPopulation:3, 
    variablesPerSplit: 20,
    bagFraction: 0.8,
    seed: 0})
  .train(predictorSet, 'CLASS', bands)
  .setOutputMode('CLASSIFICATION');

var gicRaw = covariateComposite
  .select(bands)
  .updateMask(changeFlag) // limit only to change flagged areas
  .classify(classifier);
  
var tw_change = ee.Image(gicRaw.eq(1).selfMask().rename('gain')
  .addBands(gicRaw.eq(2).selfMask().rename('loss'))
  .addBands(changeFlagImage.select(['gainYear']).uint8().updateMask(gicRaw))
  .addBands(changeFlagImage.select(['lossYear']).uint8().updateMask(gicRaw))
  .addBands(changeFlag.rename('changeflag'))

// Export final classified image to asset
var assetName = 'foo'

Export.image.toAsset({
  image: tw_change, 
  description: 'export_change_image',
  assetId: assetName,
  scale: 30,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});