import openpyxl
import json
import re

def clean_str(val):
    if val is None:
        return None
    s = str(val).strip()
    return s if s else None

def clean_num(val, default=0.0):
    if val is None:
        return default
    if isinstance(val, (int, float)):
        return float(val)
    s = str(val).strip().replace(',', '').replace('₹', '')
    # Check for formula or empty
    if not s or s.startswith('='):
        return default
    try:
        return float(s)
    except:
        return default

excel_file = r"c:\Users\Ashok Dwivedi\OneDrive\Desktop\hb crm\Brand wise products list.xlsx"
wb = openpyxl.load_workbook(excel_file, data_only=True)

all_products = []
seen_codes = {}

def add_product(brand, code, name, category=None, sub_category=None, department=None,
                description=None, pack_size=None, unit='Pcs', hsn=None,
                tax_rate=18.0, unit_price=0.0, mrp=0.0, purchase_price=0.0):
    code_str = clean_str(code)
    name_str = clean_str(name)
    if not code_str and not name_str:
        return
    
    if not code_str:
        # Generate code from brand and row index
        code_str = f"{brand.upper().replace(' ', '')[:4]}-{len(all_products)+1}"

    # Handle duplicate codes
    if code_str in seen_codes:
        seen_codes[code_str] += 1
        code_str = f"{code_str}-{seen_codes[code_str]}"
    else:
        seen_codes[code_str] = 1

    unit_price_val = clean_num(unit_price)
    mrp_val = clean_num(mrp)
    if unit_price_val <= 0 and mrp_val > 0:
        unit_price_val = mrp_val
    if mrp_val <= 0 and unit_price_val > 0:
        mrp_val = unit_price_val

    all_products.append({
        "code": code_str,
        "name": name_str or code_str,
        "brand": clean_str(brand),
        "category": clean_str(category),
        "subCategory": clean_str(sub_category),
        "department": clean_str(department),
        "description": clean_str(description),
        "packSize": clean_str(pack_size),
        "unit": clean_str(unit) or "Pcs",
        "hsnCode": clean_str(hsn),
        "taxRate": clean_num(tax_rate, 18.0),
        "unitPrice": round(unit_price_val, 2),
        "mrp": round(mrp_val, 2) if mrp_val > 0 else None,
        "purchasePrice": round(clean_num(purchase_price), 2) if clean_num(purchase_price) > 0 else None,
    })

# 1. Kohler
s_kohler = wb['Kohler']
for r in list(s_kohler.iter_rows(values_only=True))[1:]:
    if not any(r): continue
    desc = clean_str(r[9]) or clean_str(r[7]) or clean_str(r[8])
    add_product(
        brand='KOHLER',
        code=r[5],
        name=r[6],
        category=r[1],
        sub_category=r[2],
        department=r[0],
        description=desc,
        unit=r[10] or 'Pcs',
        hsn=r[12],
        tax_rate=r[14] or 18,
        unit_price=r[17],
        mrp=r[17],
        purchase_price=r[18]
    )

# 2. Fosroc
s_fosroc = wb['Fosroc']
rows_fosroc = list(s_fosroc.iter_rows(values_only=True))
for r in rows_fosroc[2:]: # data starts row 2
    if not any(r) or not r[1]: continue
    add_product(
        brand='FOSROC',
        code=r[1],
        name=r[2],
        pack_size=r[5],
        unit=r[4] or 'Kg',
        hsn=r[3],
        tax_rate=18,
        unit_price=r[6] or r[8],
        mrp=r[8] or r[6],
        purchase_price=r[7]
    )

# 3. Sika
s_sika = wb['Sika']
rows_sika = list(s_sika.iter_rows(values_only=True))
for r in rows_sika[1:]:
    if not any(r) or (not r[2] and not r[4]): continue
    add_product(
        brand='SIKA',
        code=r[2],
        name=r[4],
        category=r[3],
        pack_size=r[6],
        unit='Kg' if 'kg' in str(r[6]).lower() else 'Pcs',
        hsn=r[7],
        tax_rate=18,
        unit_price=r[10],
        mrp=r[10],
        purchase_price=r[9]
    )

# 4. Kemprol
s_kemp = wb['Kemprol']
for r in list(s_kemp.iter_rows(values_only=True))[1:]:
    if not any(r) or not r[3]: continue
    desc = clean_str(r[6]) or clean_str(r[5])
    add_product(
        brand='KEMPEROL',
        code=r[3],
        name=r[4],
        category=r[1],
        department=r[0],
        description=desc,
        unit=r[7] or 'Kg',
        hsn=r[9],
        tax_rate=r[11] or 18,
        unit_price=r[14],
        mrp=r[14],
        purchase_price=r[15]
    )

# 5. Dr Fixit
s_df = wb['Dr Fixit']
for r in list(s_df.iter_rows(values_only=True))[1:]:
    if not any(r) or not r[1]: continue
    add_product(
        brand='DR. FIXIT',
        code=r[1],
        name=r[2],
        category=r[0],
        unit=r[3] or 'ROLL',
        tax_rate=18,
        unit_price=r[6],
        mrp=r[6],
        purchase_price=r[5]
    )

# 6. VT
s_vt = wb['VT']
for r in list(s_vt.iter_rows(values_only=True))[1:]:
    if not any(r) or not r[2]: continue
    desc = clean_str(r[6]) or clean_str(r[5]) or clean_str(r[4])
    add_product(
        brand='VT',
        code=r[2],
        name=r[3],
        category=r[0],
        description=desc,
        unit=r[7] or 'SQM',
        hsn=r[9],
        tax_rate=r[11] or 18,
        unit_price=r[14],
        mrp=r[14],
        purchase_price=r[15]
    )

# 7. ROFF
s_roff = wb['ROFF']
rows_roff = list(s_roff.iter_rows(values_only=True))
# header is at row 1
for r in rows_roff[2:]:
    if not any(r) or not r[0]: continue
    add_product(
        brand='ROFF',
        code=r[0],
        name=r[4],
        category=r[2],
        unit=r[5] or 'BAG',
        hsn=r[1],
        tax_rate=18,
        unit_price=r[7] or r[8],
        mrp=r[8] or r[7],
        purchase_price=r[6]
    )

# 8. TENAX
s_tnx = wb['TENAX']
for r in list(s_tnx.iter_rows(values_only=True))[1:]:
    if not any(r) or not r[0]: continue
    add_product(
        brand='TENAX',
        code=r[0],
        name=r[4],
        category=r[1],
        unit=r[5] or 'PACK',
        hsn=r[2],
        tax_rate=18,
        unit_price=r[7] if clean_num(r[7]) > 0 else (r[8] or r[6]),
        mrp=r[8] or r[7],
        purchase_price=r[6]
    )

print(f"Total products extracted: {len(all_products)}")

out_path = r"c:\Users\Ashok Dwivedi\OneDrive\Desktop\hb crm\backend\prisma\brand-products.json"
with open(out_path, 'w', encoding='utf-8') as f:
    json.dump(all_products, f, indent=2, ensure_ascii=False)

print(f"Saved to {out_path}")
