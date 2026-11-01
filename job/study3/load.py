# Pattern hunt 3 — loading the study pulls on the runner (study-data/<batch>_<season>.json.gz, written by job/study.mjs). STUDY ONLY.
# Field names follow CFBD/CBBD's answers; `pick` tries the spellings seen across API versions, so one renamed field doesn't stop a test.
import os, glob, gzip, json, re
import numpy as np, pandas as pd

D = None
def init(d):
    global D; D = d

def answers(batch):
    for f in sorted(glob.glob(os.path.join(D, batch + '*.json.gz'))):
        j = json.load(gzip.open(f))
        for path, v in (j.get('data') or {}).items(): yield path, v

def year_of(path):
    m = re.search(r'[?&](?:year|season)=(\d{4})', path); return int(m.group(1)) if m else None

def frame(batch, flat=True):
    """every answer of a batch as one DataFrame (list answers only), with _path and _year."""
    out = []
    for p, v in answers(batch):
        if not isinstance(v, list) or not v: continue
        d = pd.json_normalize(v) if flat else pd.DataFrame(v)
        d['_path'] = p; d['_year'] = year_of(p); out.append(d)
    return pd.concat(out, ignore_index=True) if out else pd.DataFrame()

def pick(df, *names, default=np.nan):
    for n in names:
        if n in df.columns: return df[n]
    return pd.Series(default, index=df.index)

def num(s): return pd.to_numeric(s, errors='coerce')

def norm_name(s):
    s = str(s or '').lower()
    s = re.sub(r'\b(jr|sr|ii|iii|iv|v)\b\.?', '', s)
    return re.sub(r'[^a-z]', '', s)

SCHOOL = {  # nflverse college_name -> CFBD school, where they differ (checked against CFBD team names in the run's own data)
    'Miami (FL)': 'Miami', 'Miami': 'Miami', 'Miami (OH)': 'Miami (OH)', 'Southern California': 'USC', 'USC': 'USC', 'LSU': 'LSU',
    'Mississippi': 'Ole Miss', 'Ole Miss': 'Ole Miss', 'Central Florida': 'UCF', 'UCF': 'UCF', 'Brigham Young': 'BYU', 'BYU': 'BYU',
    'Texas Christian': 'TCU', 'TCU': 'TCU', 'Southern Methodist': 'SMU', 'SMU': 'SMU', 'Louisiana State': 'LSU', 'Pittsburgh': 'Pittsburgh',
    'North Carolina State': 'NC State', 'N.C. State': 'NC State', 'NC State': 'NC State', 'Florida International': 'Florida International',
    'Hawaii': "Hawai'i", "Hawai'i": "Hawai'i", 'San Jose State': 'San José State', 'Texas-El Paso': 'UTEP', 'UTEP': 'UTEP',
    'Texas-San Antonio': 'UT San Antonio', 'UTSA': 'UT San Antonio', 'Louisiana-Lafayette': 'Louisiana', 'Louisiana': 'Louisiana',
    'Louisiana-Monroe': 'UL Monroe', 'Massachusetts': 'Massachusetts', 'Connecticut': 'UConn', 'UConn': 'UConn',
    'Nevada-Las Vegas': 'UNLV', 'UNLV': 'UNLV', 'Alabama-Birmingham': 'UAB', 'UAB': 'UAB', 'Southern Mississippi': 'Southern Miss',
    'Southern Miss': 'Southern Miss', 'Appalachian State': 'App State', 'App State': 'App State', 'Bowling Green': 'Bowling Green',
    'Middle Tennessee State': 'Middle Tennessee', 'Middle Tennessee': 'Middle Tennessee', 'Sam Houston State': 'Sam Houston',
}
def school(s): return SCHOOL.get(s, s)
