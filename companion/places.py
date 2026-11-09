"""A tiny local index of places in Florence, so the trip planner runs offline.

The places are real. The summaries and suggested ages are short notes written
for this course, not official information: check opening times before you go.
"""

import re

PLACES = [
    {
        "id": "place:museo-galileo",
        "name": "Museo Galileo",
        "indoor": True,
        "min_age": 0,
        "summary": "Shows historic telescopes, globes and scientific instruments, "
                   "including two telescopes Galileo made himself.",
    },
    {
        "id": "place:leonardo-interactive",
        "name": "Leonardo Interactive Museum",
        "indoor": True,
        "min_age": 0,
        "summary": "Has hands-on wooden models of Leonardo's machines that kids can turn and push, "
                   "so it works well for children on a rainy day.",
    },
    {
        "id": "place:stibbert",
        "name": "Museo Stibbert",
        "indoor": True,
        "min_age": 0,
        "summary": "Has a hall of armoured knights on horseback, "
                   "and rooms of armour from Europe, the Middle East and Japan.",
    },
    {
        "id": "place:la-specola",
        "name": "La Specola",
        "indoor": True,
        "min_age": 0,
        "summary": "Shows hundreds of preserved animals, from insects to a hippo, "
                   "in Florence's natural history museum.",
    },
    {
        "id": "place:palazzo-vecchio",
        "name": "Palazzo Vecchio",
        "indoor": True,
        "min_age": 0,
        "summary": "Runs family tours through the painted rooms and secret passages of Florence's town hall.",
    },
    {
        "id": "place:uffizi",
        "name": "Uffizi Gallery",
        "indoor": True,
        "min_age": 6,
        "summary": "Shows Renaissance paintings such as Botticelli's Birth of Venus, "
                   "and the queue to get in can be long.",
    },
    {
        "id": "place:mercato-centrale",
        "name": "Mercato Centrale",
        "indoor": True,
        "min_age": 0,
        "summary": "Serves lunch from food stalls on the covered upper floor of the central market, "
                   "with long shared tables.",
    },
    {
        "id": "place:boboli",
        "name": "Boboli Gardens",
        "indoor": False,
        "min_age": 0,
        "summary": "Has hilly paths, fountains and a grotto behind the Pitti Palace, "
                   "but little cover from the rain.",
    },
    {
        "id": "place:giotto-tower",
        "name": "Giotto's Bell Tower",
        "indoor": False,
        "min_age": 6,
        "summary": "Has over 400 steps up to a terrace with views of the cathedral dome, "
                   "and no lift.",
    },
]

STOPWORDS = set(
    "a an and are as at be by can do does for from how i in is it its of on or "
    "should that the their they this to what when which while who why with "
    "will would you your my me we our us there where any some get see go".split()
)


def terms(text):
    """Lower-case content words, crudely stemmed so 'kids' matches 'kid'."""
    words = re.findall(r"[a-z0-9]+", text.lower())
    out = []
    for w in words:
        if w in STOPWORDS or len(w) < 3:
            continue
        for suffix in ("ing", "ed", "es", "s"):
            if w.endswith(suffix) and len(w) - len(suffix) >= 4:
                w = w[: -len(suffix)]
                break
        if w.endswith("e") and len(w) > 4:
            w = w[:-1]
        out.append(w)
    return out


def search_places(query, limit=3):
    """Read-only keyword search. Returns up to `limit` places, best match first."""
    q = set(terms(query))
    scored = []
    for place in PLACES:
        overlap = len(q & set(terms(place["name"] + " " + place["summary"])))
        if overlap:
            scored.append((-overlap, place["id"], place))
    scored.sort()
    return [dict(p) for _, _, p in scored[:limit]]


if __name__ == "__main__":
    import sys

    for p in search_places(" ".join(sys.argv[1:]) or "indoor activities for kids"):
        print(p["id"], p["name"])
