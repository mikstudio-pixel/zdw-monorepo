(function () {
  function json(v) {
    if (v === null || v === undefined) return 'null';
    if (typeof v === 'number' || typeof v === 'boolean') return String(v);
    if (typeof v === 'string') return '"' + v.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\r/g, '\\r').replace(/\n/g, '\\n') + '"';
    var parts = [], k;
    if (v instanceof Array) { for (k=0;k<v.length;k++) parts.push(json(v[k])); return '['+parts.join(',')+']'; }
    for(k in v) if(v.hasOwnProperty(k)) parts.push(json(k)+':'+json(v[k]));
    return '{'+parts.join(',')+'}';
  }
  function val(p,t) {
    var v=p.valueAtTime(t,false);
    if(p.propertyValueType===PropertyValueType.SHAPE) return {vertices:v.vertices,inTangents:v.inTangents,outTangents:v.outTangents,closed:v.closed};
    return v;
  }
  function walk(g) {
    var out=[],i,k,p,e;
    for(i=1;i<=g.numProperties;i++) {
      p=g.property(i); e={name:p.name,matchName:p.matchName};
      if(p.propertyType===PropertyType.PROPERTY) {
        try {e.value=val(p,0);e.keys=[];for(k=1;k<=p.numKeys;k++) e.keys.push({time:p.keyTime(k),value:val(p,p.keyTime(k)),inEase:p.keyInTemporalEase(k),outEase:p.keyOutTemporalEase(k)});} catch(err) {e.error=String(err);}
        if(p.matchName==='ADBE Vector Shape') {e.samples=[];for(k=0;k<=132;k++) e.samples.push(val(p,k/30));}
      } else e.children=walk(p);
      out.push(e);
    }
    return out;
  }
  var c=app.project.item(1), result={file:app.project.file.fsName,comp:c.name,width:c.width,height:c.height,fps:c.frameRate,layers:[]};
  for(var i=1;i<=c.numLayers;i++) result.layers.push({name:c.layer(i).name,properties:walk(c.layer(i))});
  var f=new File('/Users/pavelmikulecky/Projects/experiments/ZDW-liquid/reference/tutorial/native-properties.json');
  if(!f.open('w')) throw new Error(f.error); f.write(json(result)); f.close();
}());
