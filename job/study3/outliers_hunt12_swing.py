# Study book 23.4 numbers (Nov 22): NBA 2024-25 game-to-game swing in points vs the typical swing for a player's scoring and minutes.
# Players with 20+ minutes a game, 20+ games, 5+ points a game (250). "Typical" = a straight-line fit of the points spread on points a game
# and minutes a game across those players; the ranking follows hunt 12's measure (spread over average, beyond the same fit).
# Usage: python3 outliers_hunt12_swing.py <dir with nba2025.csv>
import sys, numpy as np, pandas as pd
B = pd.read_csv(f'{sys.argv[1]}/nba2025.csv', low_memory=False)
B = B[(B.season_type == 2) & (~B.did_not_play.astype(str).str.lower().eq('true'))]
B['min'] = pd.to_numeric(B.minutes, errors='coerce'); B = B[B['min'] > 0]; B['points'] = pd.to_numeric(B.points, errors='coerce').fillna(0)
C = B.groupby(['athlete_id', 'athlete_display_name']).agg(mpg=('min', 'mean'), m=('points', 'mean'), s=('points', 'std'), g=('game_id', 'size')).reset_index()
C = C[(C.mpg >= 20) & (C.g >= 20) & (C.m >= 5)].copy(); X = np.c_[np.ones(len(C)), C.m, C.mpg]
C['cvres'] = C.s / C.m - X @ np.linalg.lstsq(X, C.s / C.m, rcond=None)[0]; C['typical'] = X @ np.linalg.lstsq(X, C.s, rcond=None)[0]
pd.set_option('display.width', 200); print(len(C)); S = C.sort_values('cvres')[['athlete_display_name', 'm', 's', 'typical', 'cvres']].round(2)
print(S.head(8).to_string()); print(S.tail(8).to_string())
