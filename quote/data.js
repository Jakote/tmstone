/* TM Stone ERP — data layer.
   One interface, two backends. If Supabase is configured we use it; if not we
   fall back to localStorage so the app never simply stops working.
   Everything above this file is unaware of which is in use. */
(function () {
  const cfg = window.TMS_CONFIG || {};
  const useCloud = !!(cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && window.supabase);
  const sb = useCloud ? window.supabase.createClient(cfg.SUPABASE_URL, cfg.SUPABASE_ANON_KEY) : null;

  const local = {
    get(k, f) { try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : f; } catch (e) { return f; } },
    set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } }
  };

  /* PUBLIC BUILD — no supplier prices are shipped from a public repository.
     In local mode getMaterials() returns whatever the owner entered on his own
     device, and an empty object if he has entered nothing yet. In cloud mode
     the prices come from the materials table behind row-level security, as
     they always did. See the PUBLIC BUILD note at the top of quote/index.html. */
  const BASE_MATERIALS = {};

  const API = {
    mode: useCloud ? 'cloud' : 'local',
    user: null,
    role: 'owner',                       // local mode assumes the owner is driving

    async signIn(email, password) {
      if (!useCloud) return { ok: true, local: true };
      const { data, error } = await sb.auth.signInWithPassword({ email, password });
      if (error) return { ok: false, error: error.message };
      const { data: p } = await sb.from('profiles').select('*').eq('id', data.user.id).single();
      API.user = data.user; API.role = p?.role || 'viewer';
      return { ok: true, profile: p };
    },
    async signOut() { if (useCloud) await sb.auth.signOut(); API.user = null; },
    async restore() {
      if (!useCloud) return null;
      const { data } = await sb.auth.getSession();
      if (!data.session) return null;
      const { data: p } = await sb.from('profiles').select('*').eq('id', data.session.user.id).single();
      API.user = data.session.user; API.role = p?.role || 'viewer';
      return p;
    },

    async getMaterials() {
      if (!useCloud) return local.get('tms_materials', null) || { ...BASE_MATERIALS };
      const { data, error } = await sb.from('materials').select('code,price');
      if (error) throw error;
      return Object.fromEntries(data.map(r => [r.code, Number(r.price)]));
    },
    async setMaterial(code, price) {
      if (!useCloud) {
        const m = local.get('tms_materials', { ...BASE_MATERIALS }); m[code] = price;
        return local.set('tms_materials', m);
      }
      const { error } = await sb.from('materials').update({ price }).eq('code', code);
      if (error) throw error;                       // RLS rejects non-owners here, by design
      return true;
    },

    async getSetting(key, fallback) {
      if (!useCloud) return local.get('tms_set_' + key, fallback);
      const { data } = await sb.from('settings').select('value').eq('key', key).single();
      return data ? data.value : fallback;
    },

    async listQuotes() {
      if (!useCloud) return local.get('tms_quotes', []);
      const { data, error } = await sb.from('quotes')
        .select('*, customers(name), quote_lines(*)').order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
    async saveQuote(q) {
      if (!useCloud) {
        const all = local.get('tms_quotes', []); all.unshift(q); local.set('tms_quotes', all); return q;
      }
      const { data: cust } = await sb.from('customers')
        .insert({ name: q.customer, phone: q.phone, type: q.type }).select().single();
      const { data: quote, error } = await sb.from('quotes').insert({
        quote_no: q.quote_no, customer_id: cust?.id, site_address: q.site,
        markup_pct: q.markup, wastage_pct: q.wastage, cost_basis: q.cost_basis,
        total: q.total, subtotal: q.total, status: 'draft',
        created_by_profile: API.user?.id
      }).select().single();
      if (error) throw error;
      const lines = q.lines.map((l, i) => ({
        quote_id: quote.id, description: l.desc, area_m2: l.area, units: l.units,
        unit_cost: l.unit_cost, unit_price: l.unit_price, line_total: l.line_total, sort_order: i
      }));
      await sb.from('quote_lines').insert(lines);
      return quote;
    },
    async setQuoteStatus(id, status) {
      if (!useCloud) {
        const all = local.get('tms_quotes', []);
        const q = all.find(x => x.quote_no === id); if (q) q.status = status;
        return local.set('tms_quotes', all);
      }
      const { error } = await sb.from('quotes').update({ status }).eq('id', id);
      // the DB trigger raises if the quote is below the floor and unapproved
      if (error) throw new Error(error.message);
      return true;
    },
    async dashboard() {
      if (!useCloud) return null;
      const { data } = await sb.from('owner_dashboard').select('*').single();
      return data;
    }
  };

  window.TMS = API;
})();
