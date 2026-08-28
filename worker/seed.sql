-- Sample catalogue, mirroring the placeholder items already on the merch page.
--   wrangler d1 execute anvesha --local --file=./seed.sql
--
-- price_paise is PAISE: 49900 = ₹499.00.
-- r2_path is a key inside the R2 bucket; upload with
--   wrangler r2 object put anvesha-merch/merch/tee.jpg --file=./tee.jpg --local

INSERT OR REPLACE INTO merch (id, name, description, designer, category, r2_path, price_paise, has_size) VALUES
('MER_A1B2C3D4', 'Anvesha Tee',    'Mid-weight combed cotton, boxy cut. Screen-printed lab schematic across the chest.', 'Ananya Rao',     'Apparel', 'merch/tee.jpg',      49900, 1),
('MER_E5F6G7H8', 'Retro Hoodie',   'Heavyweight brushed fleece with a double-lined hood and ribbed cuffs.',              'Kabir Menon',    'Apparel', 'merch/hoodie.jpg',   99900, 1),
('MER_J9K0M1N2', 'Field Cap',      'Six-panel cotton twill, curved brim, brass adjuster at the back.',                   'Ishaan Dutta',   'Apparel', 'merch/cap.jpg',      39900, 1),
('MER_P3Q4R5S6', 'Canvas Tote',    '12oz natural canvas, boxed corners, webbing handles cut long enough for a shoulder.','Sanya Kulkarni', 'Accessories', 'merch/tote.jpg',     34900, 0),
('MER_T7V8W9X0', 'Cosmos Mug',     'Glazed stoneware, 350ml, full-wrap starfield that runs under the handle.',           'Dev Chatterjee', 'Accessories', 'merch/mug.jpg',      29900, 0),
('MER_Y1Z2A3B4', 'Lab Notebook',   'A5 dot-grid on 160gsm stock that lies flat at any page.',                            'Naina Verma',    'Stationery', 'merch/notebook.jpg', 24900, 0),
('MER_C5D6E7F8', 'Sticker Pack',   'Twelve die-cut vinyl stickers, laminated and genuinely weatherproof.',               'Rohan Pillai',   'Stationery', 'merch/stickers.jpg', 14900, 0);
