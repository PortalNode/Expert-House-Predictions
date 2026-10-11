// Count companies with a recorded forecast for each house in one reporting period.
// The base year can contain both built-in rows and edited rows for the same company.
function countExpertForecastsForPeriod(experts, baseRows, editedRows, canonicalCompany, parseValue) {
  const companiesByExpert = new Map(experts.map(expert => [expert, new Set()]));
  for (const row of [...baseRows, ...editedRows]) {
    const company = canonicalCompany(row.name || '');
    if (!company) continue;
    for (const expert of experts) {
      if (parseValue(row.forecasts?.[expert]) !== null) companiesByExpert.get(expert).add(company);
    }
  }
  return new Map(experts.map(expert => [expert, companiesByExpert.get(expert).size]));
}
if (typeof module !== 'undefined') module.exports = { countExpertForecastsForPeriod };
