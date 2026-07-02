// BAKED LAYOUT SNAPSHOT - authored arrangement shipped with the site.
// The site reads saved state through window.layoutGet(): a visitor own
// localStorage wins, otherwise these baked values apply. Fresh visitors get
// exactly this arrangement. Captured: 2026-06-26T14:39:11.575Z
window.BAKED_LAYOUT = {
  "gallery-order-protection-pocket": "[1,0,2,3,4]",
  "preview-count-gwcs": "1",
  "preview-count-portal-dress": "2",
  "preview-count-field-study-01": "1",
  "gallery-order-portal-dress": "[0,3,1,2,4,5]",
  "gallery-order-wind-sensor": "[1,3,2,0,5,4]",
  "preview-count-paper-daggers": "1",
  "preview-count-wind-sensor": "2",
  "large-entity-pos-v1": "{\"left\":-107,\"top\":64}",
  "preview-count-dark-ecology": "2",
  "gallery-order-usb-killcharms": "[7,0,1,2,3,4,5,6,8,9]",
  "gallery-order-cure": "[1,0,2,3,4,5,6,7,8,9]",
  "preview-count-lightshrine": "2",
  "preview-count-cure": "2",
  "gallery-order-rivers-dream": "[0,2,1,3,4,5]",
  "preview-count-drip": "2",
  "preview-count-protection-pocket": "2",
  "preview-count-seed-dress": "2",
  "gallery-order-drip": "[3,5,0,1,2,4]",
  "preview-count-capsule-collection": "2",
  "gallery-order-dark-ecology": "[3,1,2,4,5,6,7,14,8,9,0,10,11,12,13]",
  "preview-count-osa-centre": "2",
  "gallery-order-paper-daggers": "[3,0,1,2]",
  "preview-count-usb-killcharms": "2",
  "gallery-order-tank": "[1,0,2,5,3,8,4,6,7]",
  "preview-count-bc": "2",
  "gallery-order-osa-centre": "[4,0,7,5,6,8,3,9,10,11,2,1,12]",
  "preview-count-tank": "2",
  "gallery-order-lightshrine": "[4,0,1,2,3,5,6,7,8]",
  "diagram-node-pos-v1": "{\"cure\":{\"x\":60.986842105263165,\"y\":28.418549346016647},\"bc\":{\"x\":76.84210526315789,\"y\":17.00356718192628},\"dark-ecology\":{\"x\":59.28819444444444,\"y\":63.876454789615046},\"gwcs\":{\"x\":50.26315789473684,\"y\":51.724137931034484},\"lightshrine\":{\"x\":61.51315789473685,\"y\":79.66706302021403},\"rivers-dream\":{\"x\":42.171052631578945,\"y\":76.33769322235435},\"paper-daggers\":{\"x\":80.72368421052632,\"y\":62.544589774078474},\"portal-dress\":{\"x\":63.74999999999999,\"y\":64.68489892984543},\"protection-pocket\":{\"x\":64.47368421052632,\"y\":70.15457788347206},\"seed-dress\":{\"x\":53.385416666666664,\"y\":61.81736794986571},\"tank\":{\"x\":56.776315789473685,\"y\":15.576694411414982},\"drip\":{\"x\":56.64473684210526,\"y\":46.4922711058264},\"usb-killcharms\":{\"x\":82.82894736842105,\"y\":25.921521997621877},\"wind-sensor\":{\"x\":47.828947368421055,\"y\":78.83472057074911},\"osa-centre\":{\"x\":43.09210526315789,\"y\":49.94054696789536},\"capsule-collection\":{\"x\":64.27631578947368,\"y\":48.03804994054697},\"field-study-01\":{\"x\":65.0657894736842,\"y\":57.78834720570749}}",
  "gallery-order-capsule-collection": "[7,3,0,1,2,4,5,6,8,9]",
  "index-project-order-v1": "[13,10,5,11,6,0,2,3,14,12,1,8,4,7,9,15,16]"
};

window.layoutGet = function (key) {
  try {
    var v = localStorage.getItem(key);
    if (v !== null && v !== undefined) return v;
  } catch (_) {}
  if (window.BAKED_LAYOUT && Object.prototype.hasOwnProperty.call(window.BAKED_LAYOUT, key)) {
    return window.BAKED_LAYOUT[key];
  }
  return null;
};
