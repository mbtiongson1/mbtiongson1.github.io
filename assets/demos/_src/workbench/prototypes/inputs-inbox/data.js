/* Fictional prototype data. No person here exists; no number here is a Favor figure.
   The shape mirrors what the bridge's load / catalog-load / settings-load already return. */
window.PROTO = (function () {
  var campus = "MNL";
  var date = "2026-09-20";
  var now = new Date("2026-09-20T11:02:00+08:00");
  var services = [
    { id: 512, venue: "Crowne", name: "9AM" },
    { id: 513, venue: "Crowne", name: "11:30AM" },
    { id: 514, venue: "Crowne", name: "3PM" },
    { id: 515, venue: "Crowne", name: "5:30PM" }
  ];
  function at(h, m, dayOffset) {
    var d = new Date(now.getTime());
    d.setDate(d.getDate() + (dayOffset || 0));
    d.setHours(h, m, 0, 0);
    return d.toISOString();
  }
  var teams = [
    { token: "HOST", category: "MNL Host", groupGuid: "aaaa0001-0000-4000-8000-000000000001", groupName: "MNL Host Team",
      counts: ["31", "44", "27", "22"], unique: "58", meta: { at: at(10, 41), by: "Jom Santos" } },
    { token: "KIDS", category: "MNL Kids", groupGuid: "aaaa0002-0000-4000-8000-000000000002", groupName: "MNL Favor Kids Team",
      counts: ["18", "", "", ""], unique: "", meta: { at: at(9, 48), by: "Ana Reyes" } },
    { token: "WORSHIP", category: "MNL Worship", groupGuid: "aaaa0003-0000-4000-8000-000000000003", groupName: "MNL Worship Team",
      counts: ["12", "12", "11", "11"], unique: "19", meta: { at: at(10, 12), by: "Bea Lim" } },
    { token: "PROD", category: "MNL PROD", groupGuid: "aaaa0004-0000-4000-8000-000000000004", groupName: "MNL CRTVS x PROD Team",
      counts: ["9", "9", "", ""], unique: "", meta: { at: at(10, 5), by: "Carlo Dizon" } },
    { token: "PEOPLE", category: "MNL People", groupGuid: "aaaa0005-0000-4000-8000-000000000005", groupName: "MNL People Team",
      counts: ["", "", "", ""], unique: "", meta: null },
    { token: "PRAYER", category: "MNL Prayer", groupGuid: "aaaa0006-0000-4000-8000-000000000006", groupName: "MNL Prayer Team",
      counts: ["6", "7", "5", "4"], unique: "11", meta: { at: at(16, 30, -1), by: "Dan Cruz" } },
    { token: "TECH", category: "MNL Tech", groupGuid: "aaaa0007-0000-4000-8000-000000000007", groupName: "MNL Tech Team",
      counts: ["", "", "", ""], unique: "", meta: null }
  ];
  var departments = [
    { key: "PEOPLE", metrics: [
      { guid: "bbbb0001-0000-5000-8000-000000000001", title: "PPL Hands Raised", label: "Hands raised", values: ["", "", "", ""] },
      { guid: "bbbb0002-0000-5000-8000-000000000002", title: "PPL Gospel Response Lounge", label: "Lounge", values: ["", "", "", ""] },
      { guid: "bbbb0003-0000-5000-8000-000000000003", title: "PPL New People", label: "New people", values: ["", "", "", ""] },
      { guid: "bbbb0004-0000-5000-8000-000000000004", title: "PPL Physical Cards", label: "Cards", values: ["", "", "", ""], required: false }
    ], groupGuid: "aaaa0005-0000-4000-8000-000000000005" },
    { key: "KIDS", metrics: [
      { guid: "bbbb0005-0000-5000-8000-000000000005", title: "KIDS Attendance", label: "Total kids", values: ["82", "", "", ""] },
      { guid: "bbbb0006-0000-5000-8000-000000000006", title: "KIDS New", label: "New kids", values: ["4", "", "", ""] }
    ], groupGuid: "aaaa0002-0000-4000-8000-000000000002", meta: { at: at(9, 51), by: "Ana Reyes" } },
    { key: "STATS", metrics: [
      { guid: "bbbb0007-0000-5000-8000-000000000007", title: "Sunday Service Attendance", label: "Attendance", values: ["612", "1040", "588", "431"] }
    ], groupGuid: "aaaa0001-0000-4000-8000-000000000001", meta: { at: at(10, 44), by: "Jom Santos" } },
    { key: "SPECIAL SERVICES", metrics: [
      { guid: "bbbb0008-0000-5000-8000-000000000008", title: "Baptisms", label: "Baptisms", values: ["", "", "", ""], required: false }
    ] }
  ];
  var viewer = { personId: 900001, name: "Ana Reyes", isGlobal: false, memberships: [
    { groupGuid: "aaaa0002-0000-4000-8000-000000000002", groupName: "MNL Favor Kids Team", roleName: "Team Lead", isLeader: 1 },
    { groupGuid: "aaaa0001-0000-4000-8000-000000000001", groupName: "MNL Host Team", roleName: "Member", isLeader: 0 },
    { groupGuid: "aaaa0004-0000-4000-8000-000000000004", groupName: "MNL CRTVS x PROD Team", roleName: "Captain", isLeader: 0 }
  ] };
  var preferences = {
    schema: 1, version: 16, campusEnabled: true,
    required: { "bbbb0004-0000-5000-8000-000000000004": false, "bbbb0008-0000-5000-8000-000000000008": false },
    responsibilities: {
      "team:MNL:HOST": { owners: ["aaaa0001-0000-4000-8000-000000000001"] },
      "team:MNL:KIDS": { owners: ["aaaa0002-0000-4000-8000-000000000002"] },
      "team:MNL:WORSHIP": { owners: ["aaaa0003-0000-4000-8000-000000000003"] },
      "dept:MNL:KIDS": { owners: ["aaaa0002-0000-4000-8000-000000000002"] },
      "dept:MNL:STATS": { label: "Sunday attendance", owners: ["aaaa0001-0000-4000-8000-000000000001"] },
      "dept:MNL:PEOPLE": { owners: ["aaaa0005-0000-4000-8000-000000000005"] }
    }
  };
  var I = window.FavorInputsInbox;
  function units() {
    var out = [];
    teams.forEach(function (t) {
      var fields = services.map(function (s, i) {
        return { id: "count:" + t.token + ":" + s.id, label: s.name, sub: s.venue, guid: "count-" + t.token, value: t.counts[i], meta: t.counts[i] !== "" ? t.meta : null, source: "manual" };
      });
      fields.push({ id: "unique:" + t.token, label: "Unique volunteers", sub: "weekly total", guid: "unique-" + t.token, value: t.unique, meta: t.unique !== "" ? t.meta : null, source: "manual" });
      out.push({ key: I.inboxResponsibilityKey("team", campus, t.token), kind: "team", defaultLabel: I.inboxTeamLabel(t.token), matchNames: [t.category, t.token], fields: fields, team: t });
    });
    departments.forEach(function (d) {
      var fields = [];
      d.metrics.forEach(function (m) {
        services.forEach(function (s, i) {
          fields.push({ id: "stat:" + m.guid + ":" + s.id, label: m.label, sub: s.name, guid: m.guid, value: m.values[i], meta: m.values[i] !== "" ? d.meta : null, required: preferences.required[m.guid], source: "manual" });
        });
      });
      out.push({ key: I.inboxResponsibilityKey("department", campus, d.key), kind: "department", defaultLabel: I.inboxDepartmentLabel(d.key), matchNames: ["MNL " + d.key, d.key], fields: fields, department: d });
    });
    return out;
  }
  return { campus: campus, date: date, now: now, services: services, teams: teams, departments: departments, viewer: viewer, preferences: preferences, units: units,
    derivedUnique: { value: 88, filled: 4, of: 7 } };
}());
