/**
 * Global tidal wetland change post processor.
 */

var mmuPixels = 10
var gmwHabitatMask2 = ee.FeatureCollection("projects/UQ_intertidal/dataMasks/GMW_Mangrove_Habitat_v5")
var site = ee.Geometry.Polygon([-180, 60, 0, 60, 180, 60, 180, -60, 10, -60, -180, -60], null, false);  
var changeFlag = ee.Image('foo'); // path to changeFlag
var errorMask = ee.FeatureCollection('foo') //path to any vectors
 
var invErrorMask = ee.Image(1)
  .clip(errorMask)
  .mask(errorMaskImg
    .mask()
    .not());

var clark1999 = ee.ImageCollection([
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Bangladesh_Landcover_1999_v1'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Cambodia_landcover_1999_v3'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Ecuador_Landcover_1999_v3'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_India_Landcover_1999_v1_01'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_India_Landcover_1999_v1_02'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_India_Landcover_1999_v1_03'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Indonesia_Landcover_1999_v2'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Myanmar_Landcover_1999_v4'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Thailand_Landcover_1999_v4'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_Vietnam_Landcover_1999_v5'),
  ee.Image ('projects/UQ_intertidal/externalAnalyses/clarkeLabs/CLabs_malaysia_landcover_1999_v1')
  ]).mosaic();

var aquaMask1999 = clark1999.eq(3).or(clark1999.eq(5)).selfMask();

var erode = function(img, distance) {
  //reduce the mask
  var d = img.not().unmask(1).fastDistanceTransform(distance).sqrt() 
  return img.updateMask(d.gt(distance))
}
var maskErode = erode(aquaMask1999,3).unmask().eq(0).selfMask() 

var changeFlag_pp1 = changeFlag
    .updateMask(invErrorMask) 
    .updateMask(maskErode);  

function mmuRemove (changeImage,mmuPixels){
  // removes small patches
  var lossImage = changeImage.select(['loss']);
  var connectedLoss = lossImage.connectedPixelCount(mmuPixels+2,true);
  var elimLoss = connectedLoss.gte(mmuPixels).selfMask();
  var ppLoss = lossImage.updateMask(elimLoss);
  var ppLossYear = changeImage.select(['lossYear']).updateMask(elimLoss);
  var gainImage = changeImage.select(['gain']);
  var connectedGain = gainImage.connectedPixelCount(mmuPixels+2,true);
  var elimGain = connectedGain.gte(mmuPixels).selfMask();
  var ppGain = gainImage.updateMask(elimGain);
  var ppGainYear = changeImage.select(['gainYear']).updateMask(elimGain);
  var ppOut = ppLoss
    .addBands(ppLossYear)
    .addBands(ppGain)
    .addBands(ppGainYear);
  return ee.Image(ppOut);
}

var changeFlag_pp2 = mmuRemove(changeFlag_pp1, mmuPixels)

var assetName = 'foo'; // path and asset name

Export.image.toAsset({
  image: changeFlag_pp2, 
  description: 'export_change_flag_pp',
  assetId: assetName,
  scale: 30,
  region: site,
  pyramidingPolicy: {'.default': 'mode'},
  maxPixels: 1000000000000
});