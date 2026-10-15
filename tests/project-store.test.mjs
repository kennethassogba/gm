import test from 'node:test';
import assert from 'node:assert/strict';
import {IDBFactory} from 'fake-indexeddb';
import {ProjectStore,duplicateProject} from '../public/project-store.js';
import {createEmptyModel} from '../public/model.js';

test('Legacy projects migrate once, without truncation or changes to the original browser data',async()=>{
 const factory=new IDBFactory(),store=new ProjectStore(factory);
 const models=Array.from({length:22},(_,i)=>createEmptyModel('Project '+i));
 const legacy=JSON.stringify(models),storage={getItem:key=>key==='gm.documents.v2'?legacy:key==='gm.studio.model.v1'?JSON.stringify({...models[0],name:'Older copy'}):null};
 await store.migrate(storage);assert.equal((await store.list()).length,22);
 assert.equal((await store.get(models[0].id)).name,'Project 0');
 const edited=await store.get(models[0].id);edited.name='Edited project';await store.put(edited);
 await store.migrate(storage);assert.equal((await store.get(edited.id)).name,'Edited project');assert.equal(storage.getItem('gm.documents.v2'),legacy);
});

test('Switching and reopening retains each project independently, including rapid saves',async()=>{
 const factory=new IDBFactory(),store=new ProjectStore(factory),first=createEmptyModel('First'),second=createEmptyModel('Second');
 first.metadata.notes='Original';const a=store.put(first);first.metadata.notes='Latest';const b=store.put(first);const c=store.put(second);await Promise.all([a,b,c]);
 const reopened=new ProjectStore(factory);assert.equal((await reopened.list()).length,2);
 assert.equal((await reopened.get(first.id)).metadata.notes,'Latest');assert.equal((await reopened.get(second.id)).name,'Second');
});

test('Duplicates have independent document IDs and geometry; deleted projects remain recoverable',async()=>{
 const store=new ProjectStore(new IDBFactory()),model=createEmptyModel('Detector');model.cells.push({id:1,name:'Crystal'});await store.put(model);
 const copy=duplicateProject(model,['Detector copy']);assert.equal(copy.name,'Detector copy 2');assert.notEqual(copy.id,model.id);copy.cells[0].name='Changed';assert.equal(model.cells[0].name,'Crystal');await store.put(copy);
 await store.setDeleted(model.id,true);assert.ok((await store.list()).find(p=>p.id===model.id).deletedAt);assert.equal((await store.get(model.id)).cells[0].name,'Crystal');
 await store.setDeleted(model.id,false);assert.equal((await store.list()).find(p=>p.id===model.id).deletedAt,undefined);
});

test('A stale tab cannot overwrite or remove a project saved by another tab',async()=>{
 const factory=new IDBFactory(),a=new ProjectStore(factory),b=new ProjectStore(factory),model=createEmptyModel('Shared');await a.put(model);await b.list();
 const stale=await b.get(model.id);model.name='Newer edit';await a.put(model);
 stale.name='Stale edit';await assert.rejects(b.put(stale),/another tab/);await assert.rejects(b.setDeleted(model.id,true),/another tab/);
 assert.equal((await a.get(model.id)).name,'Newer edit');
 const recovered=duplicateProject(stale);await b.put(recovered);assert.equal((await b.get(recovered.id)).name,'Stale edit copy');
});
