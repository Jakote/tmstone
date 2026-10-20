/* TM Stone ERP — connection config
   Fill these in from Supabase → Project Settings → API, then reload.
   Until they are filled in, the app runs in LOCAL mode (localStorage) so it
   still works for demos and for quoting on a laptop with no signal.
   The anon key is safe in the browser: row-level security protects the data. */
window.TMS_CONFIG = {
  SUPABASE_URL: '',        // e.g. https://abcdefgh.supabase.co
  SUPABASE_ANON_KEY: '',   // the "anon public" key — never the service_role key
  COMPANY: {
    name: 'TM STONE SOLUTIONS (PTY) LTD',
    trading_as: 'TM STONE',
    reg_no: 'A2026/34518',
    founded: 2020,                      // trading since 2020; licence renewed 25 Mar 2026
    phone: '+266 50659716',
    address: 'Ha Tsosane Pela Boitumela, Maseru, Lesotho'
  }
};
