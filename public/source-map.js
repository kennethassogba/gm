// Core map and guide positions adapted from MIT CRPG public model sources.
// https://github.com/mit-crpg/BEAVRS (specification 2.0.2)
export const CORE_ROWS = [
  "dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy",
  "dummy dummy dummy dummy dummy bafnw bafn_ bafn_ bafn_ bafn_ bafn_ bafn_ bafn_ bafne dummy dummy dummy dummy dummy",
  "dummy dummy dummy bafnw bafn_ bfcnw L___1 K___1 J___1 H___1 G___1 F___1 E___1 bfcne bafn_ bafne dummy dummy dummy",
  "dummy dummy bafnw bfcnw N___2 M___2 L___2 K___2 J___2 H___2 G___2 F___2 E___2 D___2 C___2 bfcne bafne dummy dummy",
  "dummy dummy bafw_ P___3 N___3 M___3 L___3 K___3 J___3 H___3 G___3 F___3 E___3 D___3 C___3 B___3 bafe_ dummy dummy",
  "dummy bafnw bfcnw P___4 N___4 M___4 L___4 K___4 J___4 H___4 G___4 F___4 E___4 D___4 C___4 B___4 bfcne bafne dummy",
  "dummy bafw_ R___5 P___5 N___5 M___5 L___5 K___5 J___5 H___5 G___5 F___5 E___5 D___5 C___5 B___5 A___5 bafe_ dummy",
  "dummy bafw_ R___6 P___6 N___6 M___6 L___6 K___6 J___6 H___6 G___6 F___6 E___6 D___6 C___6 B___6 A___6 bafe_ dummy",
  "dummy bafw_ R___7 P___7 N___7 M___7 L___7 K___7 J___7 H___7 G___7 F___7 E___7 D___7 C___7 B___7 A___7 bafe_ dummy",
  "dummy bafw_ R___8 P___8 N___8 M___8 L___8 K___8 J___8 H___8 G___8 F___8 E___8 D___8 C___8 B___8 A___8 bafe_ dummy",
  "dummy bafw_ R___9 P___9 N___9 M___9 L___9 K___9 J___9 H___9 G___9 F___9 E___9 D___9 C___9 B___9 A___9 bafe_ dummy",
  "dummy bafw_ R__10 P__10 N__10 M__10 L__10 K__10 J__10 H__10 G__10 F__10 E__10 D__10 C__10 B__10 A__10 bafe_ dummy",
  "dummy bafw_ R__11 P__11 N__11 M__11 L__11 K__11 J__11 H__11 G__11 F__11 E__11 D__11 C__11 B__11 A__11 bafe_ dummy",
  "dummy bafsw bfcsw P__12 N__12 M__12 L__12 K__12 J__12 H__12 G__12 F__12 E__12 D__12 C__12 B__12 bfcse bafse dummy",
  "dummy dummy bafw_ P__13 N__13 M__13 L__13 K__13 J__13 H__13 G__13 F__13 E__13 D__13 C__13 B__13 bafe_ dummy dummy",
  "dummy dummy bafsw bfcsw N__14 M__14 L__14 K__14 J__14 H__14 G__14 F__14 E__14 D__14 C__14 bfcse bafse dummy dummy",
  "dummy dummy dummy bafsw bafs_ bfcsw L__15 K__15 J__15 H__15 G__15 F__15 E__15 bfcse bafs_ bafse dummy dummy dummy",
  "dummy dummy dummy dummy dummy bafsw bafs_ bafs_ bafs_ bafs_ bafs_ bafs_ bafs_ bafse dummy dummy dummy dummy dummy",
  "dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy dummy"
].map((row) => row.split(" "));

export const GUIDE_POSITIONS = new Set([
  "2,5", "2,8", "2,11", "3,3", "3,13", "5,2", "5,5", "5,8", "5,11", "5,14",
  "8,2", "8,5", "8,8", "8,11", "8,14", "11,2", "11,5", "11,8", "11,11", "11,14",
  "13,3", "13,13", "14,5", "14,8", "14,11"
]);

