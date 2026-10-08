import { db } from './client.js';

const email = 'demo@acmeexports.com';
const partners = [
  ['delhivery-demo', 'Delhivery', 'surface', 'Delhivery Surface', 12450, 2850],
  ['bluedart-demo', 'Blue Dart', 'air', 'Blue Dart Air', 21800, 5400],
  ['xpressbees-demo', 'XpressBees', 'surface', 'XpressBees Surface', 14600, 3200],
] as const;

async function main() {
  const seller = await db.query<{ seller_id: string }>('SELECT m.seller_id FROM seller_memberships m JOIN users u ON u.id=m.user_id WHERE u.email=$1', [email]);
  if (!seller.rows[0]) throw new Error(`Create ${email} before seeding its network`);
  const sellerId = seller.rows[0].seller_id;
  const ids: string[] = [];
  for (const [code, name, serviceType, serviceName] of partners) {
    const provider = await db.query<{ id: string }>(`INSERT INTO courier_providers (code,name,integration_state,supports_cod) VALUES ($1,$2,'live',true) ON CONFLICT (code) DO UPDATE SET integration_state='live',supports_cod=true RETURNING id`, [code, name]);
    const service = await db.query<{ id: string }>(`INSERT INTO courier_services (provider_id,code,display_name,service_type) VALUES ($1,'standard',$2,$3) ON CONFLICT (provider_id,code) DO UPDATE SET display_name=EXCLUDED.display_name,is_active=true RETURNING id`, [provider.rows[0].id, serviceName, serviceType]);
    ids.push(service.rows[0].id);
    await db.query(`INSERT INTO seller_courier_access (seller_id,service_id,account_mode,state,cod_enabled,auto_assign_eligible) VALUES ($1,$2,'platform','enabled',true,true) ON CONFLICT (seller_id,service_id) DO UPDATE SET state='enabled',cod_enabled=true,auto_assign_eligible=true`, [sellerId, service.rows[0].id]);
  }
  let card = await db.query<{ id: string }>(`SELECT id FROM rate_cards WHERE seller_id=$1 AND state='active' ORDER BY effective_from DESC, created_at DESC LIMIT 1`, [sellerId]);
  if (!card.rows[0]) card = await db.query<{ id: string }>(`INSERT INTO rate_cards (seller_id,name,state,effective_from) VALUES ($1,'Demo admin rate card','active',now()) RETURNING id`, [sellerId]);
  for (let i = 0; i < ids.length; i++) {
    const [, , , , base, additional] = partners[i];
    await db.query(`INSERT INTO rate_card_rates (rate_card_id,service_id,zone_code,min_weight_g,base_weight_g,base_price_paise,additional_weight_g,additional_price_paise,cod_fee_paise,fuel_surcharge_bps) VALUES ($1,$2,'national',0,500,$3,500,$4,2500,800) ON CONFLICT (rate_card_id,service_id,zone_code,min_weight_g) DO UPDATE SET base_price_paise=EXCLUDED.base_price_paise,additional_price_paise=EXCLUDED.additional_price_paise,cod_fee_paise=EXCLUDED.cod_fee_paise,fuel_surcharge_bps=EXCLUDED.fuel_surcharge_bps`, [card.rows[0].id, ids[i], base, additional]);
  }
  console.log(`Demo courier network ready for ${email}: ${partners.length} live partner services.`);
  await db.end();
}
main().catch(async (error) => { console.error(error); await db.end(); process.exit(1); });
