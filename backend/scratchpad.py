import json
import re

s = '{"topics":[{"node_id":"node_138ff97066bd","order":1,"prerequisites":[]},{"node_id":"node_f569684d6b8e","order":2,"prerequisites":["node_138ff97066bd"]},{"node_id":"node_412e33242017","order":3,"prerequisites":[]},{"node_id":"node_00a8693f3809","order":4,"prerequisites":[]},{"node_id":"node_b972532c5469","order":5,"prerequisites":["node_00a8693f3809","node_412e33242017"]},{"node_id":"node_2bf894a872b4","order":6,"prerequisites":[]},{"node_635cf939ab3f","order":7,"prerequisites":["node_2bf894a872b4"]},{"node_id":"node_761d7fb3246e","order":8,"prerequisites":["node_635cf939ab3f"]},{"node_id":"node_26df25c29bc7","order":9,"prerequisites":["node_635cf939ab3f"]},{"node_id":"node_43dffba9cd79","order":10,"prerequisites":["node_2bf894a872b4"]},{"node_id":"node_8b137a82d143","order":11,"prerequisites":["node_b972532c5469"]},{"node_id":"node_5bc3e8a53dd3","order":12,"prerequisites":["node_8b137a82d143"]},{"node_id":"node_775d435079b9","order":13,"prerequisites":[]},{"node_id":"node_bc83aa8b24b0","order":14,"prerequisites":["node_b972532c5469"]},{"node_id":"node_5de181d4c024","order":15,"prerequisites":[]},{"node_id":"node_b54ad8befab6","order":16,"prerequisites":[]},{"node_id":"node_de7f31c92e0e","order":17,"prerequisites":[]},{"node_id":"node_a3443ffd57f4","order":18,"prerequisites":["node_f569684d6b8e","node_b972532c5469"]},{"node_id":"node_6144e8ac8062","order":19,"prerequisites":[]},{"node_id":"node_9cda8b62914e","order":20,"prerequisites":[]},{"node_id":"node_1c81a26db3a8","order":21,"prerequisites":[]}]}'

# fix missing node_id key
fixed = re.sub(r'\{\s*"node_([a-zA-Z0-9_]+)"\s*,', r'{"node_id":"node_\1",', s)

try:
    json.loads(fixed)
    print("Success")
except Exception as e:
    print(f"Error: {e}")
