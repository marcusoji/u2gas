"""
Node-id corrections, found by matching every rendered element against every
visible node in its Figma screen (absoluteBoundingBox, visible ancestors only)
and taking the best match.

Only matches that are tight are applied: 0-3px, or a text node whose box
differs only because the substitute font measures wider (jgs5/Barlow are not
bundled). Geometry is untouched — these elements were already in the right
place under a neighbour's id, mostly from id tuples shifted by one slot.

Applied simultaneously per screen, so swaps (2642 <-> 2643) resolve correctly.
"""
RELABEL = {
    "1:326":  {"334b": "334", "336": "337", "369": "370", "370": "371", "337": "338", "334": "335"},
    "1:583":  {"590b": "591", "593": "594", "625": "623", "626": "625", "626t": "626",
               "594": "595", "591": "592", "665": "664"},
    "1:669":  {"679": "681"},
    "1:762":  {"772": "774"},
    "1:989":  {"999": "1001"},
    "1:1219": {"1220": "1227", "1221": "1228", "1224": "1231", "1256": "1262",
               "1257": "1264", "1258": "1265", "1225": "1232", "1222": "1229"},
    # CHECKOUT NO ADDRESS reused CART's basket and carried CART's ids.
    "1:1952": {"1585": "2020", "1586": "2021", "1591": "2024", "1588": "2023",
               "1587": "2022",
               "2052": "2059", "2054": "2061"},

    # The checkout screens reuse the PAY sheets and the cart basket, so they
    # carried those frames' ids. Found by comparing each element's parent in
    # the file with its parent here — the geometry matched all along, which is
    # why the position pass never saw it. The sheets are a constant offset
    # (1:1419 -> 1:1800 is +381; 1:401 -> 1:1924 is +1523).
    "1:1703": {'1420': '1801', '1421': '1802', '1422': '1803', '1423': '1804', '1424': '1805', '1425': '1806', '1426': '1807', '1427': '1808', '1428': '1809', '1429': '1810', '1430': '1811', '1431': '1812', '1432': '1813', '1433': '1814', '1434': '1815', '1435': '1816', '1436': '1817', '1437': '1818', '1585': '1771', '1586': '1772', '1587': '1773', '1588': '1774', '1591': '1775'},
    "1:1827": {'402': '1925', '403': '1926', '404': '1927', '405': '1928', '406': '1929', '407': '1930', '408': '1931', '409': '1932', '410': '1933', '411': '1934', '412': '1935', '413': '1936', '414': '1937', '415': '1938', '416': '1939', '417': '1940', '418': '1941', '419': '1942', '420': '1943', '1585': '1895', '1586': '1896', '1587': '1897', '1588': '1898', '1591': '1899'},
    "1:4114": {"4118": "4122"},
    "1:4192": {"4196": "4200", "4213": "4283"},
    "1:4285": {"4289": "4293", "4306": "4375"},
    "1:2624": {"2643": "2642", "2642": "2641"},
    "1:2747": {"2766": "2765", "2765": "2764"},
    "1:2847": {"3010": "3009", "3009": "3008"},
    "1:3245": {"3402": "3412", "3401": "3400"},
    "1:3461": {"3618": "3628", "3617": "3616"},
    "1:3675": {"3730": "3731"},
    "1:3781": {"3836": "3837"},
}


def apply(frame_node, body):
    import re
    m = RELABEL.get(frame_node)
    if not m:
        return body
    return re.sub(r'data-node="1:([0-9a-z]+)"',
                  lambda k: f'data-node="1:{m.get(k.group(1), k.group(1))}"', body)
