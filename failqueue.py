#Thank you cringemoment
coverfile = open("output/cover.csv").read().splitlines()[1:]
accum = ""
for cover in coverfile:
    coverage = cover.split(",")[1:]
    coverqueue = cover.split(",")[0]
    coverage = any([True if i == "O" else False for i in coverage])
    if not coverage:
        print(coverqueue)
        exit()