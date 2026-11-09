/* Category presentation only. Stable IDs retain their visual when renamed. */
(function (root) {
  'use strict';

  const badge = (emoji, tone) => Object.freeze({emoji, tone});
  const visuals = Object.freeze({
    'baby-supplies': badge('🍼', 'rose'),
    business: badge('💼', 'blue'),
    'camera-exchange': badge('📷', 'slate'),
    'car-maintenance-registration': badge('🚗', 'blue'),
    'card-payment': badge('💳', 'slate'),
    'construction-improvements': badge('🛠️', 'amber'),
    'daycare-school': badge('🎒', 'violet'),
    entertainment: badge('🎟️', 'violet'),
    fuel: badge('⛽', 'amber'),
    'gifts-parties': badge('🎁', 'rose'),
    groceries: badge('🛒', 'teal'),
    'health-medical': badge('🩺', 'rose'),
    'home-furniture': badge('🛋️', 'teal'),
    income: badge('💰', 'teal'),
    insurance: badge('🛡️', 'blue'),
    'investment-contribution': badge('📈', 'teal'),
    mortgage: badge('🏠', 'blue'),
    nanny: badge('🧸', 'violet'),
    'other-personal': badge('👤', 'slate'),
    'personal-care': badge('🧴', 'rose'),
    'restaurants-cafes': badge('🍽️', 'amber'),
    shopping: badge('🛍️', 'violet'),
    'streaming-apps': badge('📺', 'violet'),
    takeout: badge('🥡', 'amber'),
    'taxes-fees': badge('🧾', 'slate'),
    'transfer-review': badge('↔️', 'slate'),
    'transport-parking': badge('🚕', 'blue'),
    travel: badge('✈️', 'blue'),
    unclassified: badge('🏷️', 'slate'),
    'utilities-communications': badge('💡', 'amber')
  });
  const normalize = value => String(value || '').normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '').toLowerCase().trim();
  const nameRules = [
    [/\b(mortgage|hipoteca|dividendo)\b/, 'mortgage'],
    [/\b(baby|babies|bebe|panales|diapers)\b/, 'baby-supplies'],
    [/\b(daycare|school|education|colegio|jardin|educacion)\b/, 'daycare-school'],
    [/\b(nanny|childcare|child care|ninera|nana)\b/, 'nanny'],
    [/\b(groceries|grocery|supermarket|supermercado|despensa)\b/, 'groceries'],
    [/\b(health|medical|medicine|pharmacy|salud|medico|farmacia)\b/, 'health-medical'],
    [/\b(insurance|seguro|seguros)\b/, 'insurance'],
    [/\b(construction|improvements|renovation|construccion|remodelacion)\b/, 'construction-improvements'],
    [/\b(home|house|furniture|hogar|casa|muebles)\b/, 'home-furniture'],
    [/\b(takeout|takeaway|delivery|comida a domicilio)\b/, 'takeout'],
    [/\b(restaurants?|cafes?|dining|restaurantes?|cafeteria)\b/, 'restaurants-cafes'],
    [/\b(personal care|beauty|cuidado personal|belleza)\b/, 'personal-care'],
    [/\b(streaming|apps?|subscriptions?|suscripciones)\b/, 'streaming-apps'],
    [/\b(entertainment|movies|cinema|entretencion|cine)\b/, 'entertainment'],
    [/\b(fuel|gasoline|petrol|combustible|bencina)\b/, 'fuel'],
    [/\b(transport|parking|taxi|transporte|estacionamiento)\b/, 'transport-parking'],
    [/\b(car|vehicle|auto|automovil|vehiculo)\b/, 'car-maintenance-registration'],
    [/\b(travel|vacation|flights?|viajes?|vacaciones|vuelos?)\b/, 'travel'],
    [/\b(gifts?|parties|regalos?|fiestas?)\b/, 'gifts-parties'],
    [/\b(utilities|communications?|electricity|internet|servicios|comunicaciones|electricidad)\b/, 'utilities-communications'],
    [/\b(taxes|fees|impuestos|comisiones)\b/, 'taxes-fees'],
    [/\b(investments?|investing|brokerage|retirement|inversiones?|jubilacion|retiro)\b/, 'investment-contribution'],
    [/\b(income|salary|earnings|ingresos?|sueldo|honorarios)\b/, 'income'],
    [/\b(business|work|negocio|trabajo)\b/, 'business'],
    [/\b(camera|photo|camara|fotografia)\b/, 'camera-exchange'],
    [/\b(shopping|purchases?|compras)\b/, 'shopping'],
    [/\b(card payment|credit card|pago de tarjeta)\b/, 'card-payment'],
    [/\b(transfers?|transferencias?)\b/, 'transfer-review'],
    [/\b(personal)\b/, 'other-personal']
  ];

  function visual(category) {
    const data = typeof category === 'string' ? {id:category, name:category} : (category || {});
    const id = normalize(data.id);
    if (Object.prototype.hasOwnProperty.call(visuals, id)) return visuals[id];
    const name = normalize(data.name || data.id).replace(/[-_]/g, ' ');
    const matched = nameRules.find(([pattern]) => pattern.test(name));
    return matched ? visuals[matched[1]] : visuals.unclassified;
  }

  root.CasaCategories = Object.freeze({visual});
})(typeof window !== 'undefined' ? window : globalThis);
