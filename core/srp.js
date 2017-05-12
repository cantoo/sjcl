/** @fileOverview Javascript SRP implementation.
 *
 * This file contains a partial implementation of the SRP (Secure Remote
 * Password) password-authenticated key exchange protocol. Given a user
 * identity, salt, and SRP group, it generates the SRP verifier that may
 * be sent to a remote server to establish and SRP account.
 *
 * For more information, see http://srp.stanford.edu/.
 *
 * @author Quinn Slack
 */

/**
 * Compute the SRP verifier from the username, password, salt, and group.
 * @namespace
 */
sjcl.keyexchange.srp = {
  /**
   * Calculates SRP v, the verifier.
   *   v = g^x mod N [RFC 5054]
   * @param {String} I The username.
   * @param {String} P The password.
   * @param {Object} s A bitArray of the salt.
   * @param {Object} group The SRP group. Use sjcl.keyexchange.srp.knownGroup
                           to obtain this object.
   * @return {Object} A bitArray of SRP v.
   */
  makeVerifier: function(I, P, s, group) {
    var x;
    x = sjcl.keyexchange.srp._makeX(I, P, s);
    x = sjcl.bn.fromBits(x);
    return group.g.powermod(x, group.N).toBits();
  },
  
  _pad: function(p, N) {
    var pad = new Array(N.length);
	var i = 0;
	for(i = 0; i < pad.length; ++i) {
	  pad[i] = 0;
	}
	
	pad = sjcl.bitArray.bitSlice(pad, 0, sjcl.bitArray.bitLength(N) - sjcl.bitArray.bitLength(p));
	pad = sjcl.bitArray.concat(pad, p);
	return pad;
  },
  
  /**
   * k = SHA1( N | pad(g) )
   * @param {Object} group The SRP group. Use sjcl.keyexchange.srp.knownGroup
                           to obtain this object.
   * @return {Object} A bitArray of SRP k
   */
  _makeK: function(group) {
	var N = group.N.toBits();
	var g = group.g.toBits();
	
	return sjcl.hash.sha1.hash(sjcl.bitArray.concat(N, sjcl.keyexchange.srp._pad(g, N)));
  },

  /**
   * Calculates SRP x.
   *   x = SHA1(<salt> | SHA(<username> | ":" | <raw password>)) [RFC 2945]
   * @param {String} I The username.
   * @param {String} P The password.
   * @param {Object} s A bitArray of the salt.
   * @return {Object} A bitArray of SRP x.
   */
  _makeX: function(I, P, s) {
    var inner = sjcl.hash.sha1.hash(I + ':' + P);
    return sjcl.hash.sha1.hash(sjcl.bitArray.concat(s, inner));
  },
  
  /**
   * k = SHA1( pad(A) | pad(B) )
   * @param {Object} group The SRP group. Use sjcl.keyexchange.srp.knownGroup
                           to obtain this object.
   * @return {Object} A bitArray of SRP u
   */
  _makeU: function(A, B, group) {
	var N = group.N.toBits();
	return sjcl.hash.sha1.hash(sjcl.bitArray.concat(sjcl.keyexchange.srp._pad(A, N), sjcl.keyexchange.srp._pad(B, N)));
  },
  
  /**
   * A = g ^ a mod N
   * @param {Object} a A bitArray of client random SRP a
   * @return {Object} A bitArray of SRP A
   */
  makeA: function(a, group) {
	a = sjcl.bn.fromBits(a);
	return group.g.powermod(a, group.N).toBits();
  },
  
  /**
   * (B − k(g ^ x mod N)) ^ (a + ux) mod N
   */
  makeClientKey: function(I, P, s, a, A, B, group) {	
	var x = sjcl.bn.fromBits(sjcl.keyexchange.srp._makeX(I, P, s));
	var k = sjcl.bn.fromBits(sjcl.keyexchange.srp._makeK(group));
	var u = sjcl.bn.fromBits(sjcl.keyexchange.srp._makeU(A, B, group));
	
	var key = group.g.powermod(x, group.N);
	key = key.mulmod(k, group.N);
	key = sjcl.bn.fromBits(B).sub(key).mod(group.N);
	
	var power = u.mul(x);
	power = sjcl.bn.fromBits(a).add(power);
	key = key.powermod(power, group.N);
	return key.toBits();
  },
  
  /**
   * H[H(N) XOR H(g) | H(username) | s | A | B | K]
   */
  makeM1: function(I, s, A, B, K, group) {
	var hN = sjcl.hash.sha1.hash(group.N.toBits());
	var hg = sjcl.hash.sha1.hash(group.g.toBits());
	var i = 0;
	for(i = 0; i < hN.length; ++i) {
	  hN[i] = hN[i] ^ hg[i];
	}
	
	var out = sjcl.bitArray.concat(hN, sjcl.hash.sha1.hash(I));
	out = sjcl.bitArray.concat(out, s);
	out = sjcl.bitArray.concat(out, A);
	out = sjcl.bitArray.concat(out, B);
	out = sjcl.bitArray.concat(out, K);
	out = sjcl.hash.sha1.hash(out);
	return out;
  },
  
  /**
   * H(A | M1 | K) 
   */
  makeM2: function(A, M1, K) {
	var out = sjcl.bitArray.concat(A, M1);
	out = sjcl.bitArray.concat(out, K);
	out = sjcl.hash.sha1.hash(out);
	return out;
  },

  /**
   * Returns the known SRP group with the given size (in bits).
   * @param {String} i The size of the known SRP group.
   * @return {Object} An object with "N" and "g" properties.
   */
  knownGroup:function(i) {
    if (typeof i !== "string") { i = i.toString(); }
    if (!sjcl.keyexchange.srp._didInitKnownGroups) { sjcl.keyexchange.srp._initKnownGroups(); }
    return sjcl.keyexchange.srp._knownGroups[i];
  },

  /**
   * Initializes bignum objects for known group parameters.
   * @private
   */
  _didInitKnownGroups: false,
  _initKnownGroups:function() {
    var i, size, group;
    for (i=0; i < sjcl.keyexchange.srp._knownGroupSizes.length; i++) {
      size = sjcl.keyexchange.srp._knownGroupSizes[i].toString();
      group = sjcl.keyexchange.srp._knownGroups[size];
      group.N = new sjcl.bn(group.N);
      group.g = new sjcl.bn(group.g);
    }
    sjcl.keyexchange.srp._didInitKnownGroups = true;
  },

  _knownGroupSizes: [1024, 1536, 2048, 3072, 4096, 6144, 8192],
  _knownGroups: {
    1024: {
      N: "EEAF0AB9ADB38DD69C33F80AFA8FC5E86072618775FF3C0B9EA2314C" +
         "9C256576D674DF7496EA81D3383B4813D692C6E0E0D5D8E250B98BE4" +
         "8E495C1D6089DAD15DC7D7B46154D6B6CE8EF4AD69B15D4982559B29" +
         "7BCF1885C529F566660E57EC68EDBC3C05726CC02FD4CBF4976EAA9A" +
         "FD5138FE8376435B9FC61D2FC0EB06E3",
      g:2
    },

    1536: {
      N: "9DEF3CAFB939277AB1F12A8617A47BBBDBA51DF499AC4C80BEEEA961" +
         "4B19CC4D5F4F5F556E27CBDE51C6A94BE4607A291558903BA0D0F843" +
         "80B655BB9A22E8DCDF028A7CEC67F0D08134B1C8B97989149B609E0B" +
         "E3BAB63D47548381DBC5B1FC764E3F4B53DD9DA1158BFD3E2B9C8CF5" +
         "6EDF019539349627DB2FD53D24B7C48665772E437D6C7F8CE442734A" +
         "F7CCB7AE837C264AE3A9BEB87F8A2FE9B8B5292E5A021FFF5E91479E" +
         "8CE7A28C2442C6F315180F93499A234DCF76E3FED135F9BB",
      g: 2
    },

    2048: {
      N: "AC6BDB41324A9A9BF166DE5E1389582FAF72B6651987EE07FC319294" +
         "3DB56050A37329CBB4A099ED8193E0757767A13DD52312AB4B03310D" +
         "CD7F48A9DA04FD50E8083969EDB767B0CF6095179A163AB3661A05FB" +
         "D5FAAAE82918A9962F0B93B855F97993EC975EEAA80D740ADBF4FF74" +
         "7359D041D5C33EA71D281E446B14773BCA97B43A23FB801676BD207A" +
         "436C6481F1D2B9078717461A5B9D32E688F87748544523B524B0D57D" +
         "5EA77A2775D2ECFA032CFBDBF52FB3786160279004E57AE6AF874E73" +
         "03CE53299CCC041C7BC308D82A5698F3A8D0C38271AE35F8E9DBFBB6" +
         "94B5C803D89F7AE435DE236D525F54759B65E372FCD68EF20FA7111F" +
         "9E4AFF73",
      g: 2
    },

    3072: {
      N: "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08" +
         "8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B" +
         "302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9" +
         "A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6" +
         "49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8" +
         "FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
         "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C" +
         "180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
         "3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D" +
         "04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D" +
         "B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D226" +
         "1AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
         "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFC" +
         "E0FD108E4B82D120A93AD2CAFFFFFFFFFFFFFFFF",
       g: 5
    },

    4096: {
      N: "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08" +
        "8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B" +
        "302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9" +
        "A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6" +
        "49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8" +
        "FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C" +
        "180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
        "3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D" +
        "04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D" +
        "B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D226" +
        "1AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFC" +
        "E0FD108E4B82D120A92108011A723C12A787E6D788719A10BDBA5B26" +
        "99C327186AF4E23C1A946834B6150BDA2583E9CA2AD44CE8DBBBC2DB" +
        "04DE8EF92E8EFC141FBECAA6287C59474E6BC05D99B2964FA090C3A2" +
        "233BA186515BE7ED1F612970CEE2D7AFB81BDD762170481CD0069127" +
        "D5B05AA993B4EA988D8FDDC186FFB7DC90A6C08F4DF435C934063199" +
        "FFFFFFFFFFFFFFFF",
      g: 5
    },

    6144: {
      N: "FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08" +
        "8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B" +
        "302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9" +
        "A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6" +
        "49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8" +
        "FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C" +
        "180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
        "3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D" +
        "04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D" +
        "B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D226" +
        "1AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFC" +
        "E0FD108E4B82D120A92108011A723C12A787E6D788719A10BDBA5B26" +
        "99C327186AF4E23C1A946834B6150BDA2583E9CA2AD44CE8DBBBC2DB" +
        "04DE8EF92E8EFC141FBECAA6287C59474E6BC05D99B2964FA090C3A2" +
        "233BA186515BE7ED1F612970CEE2D7AFB81BDD762170481CD0069127" +
        "D5B05AA993B4EA988D8FDDC186FFB7DC90A6C08F4DF435C934028492" +
        "36C3FAB4D27C7026C1D4DCB2602646DEC9751E763DBA37BDF8FF9406" +
        "AD9E530EE5DB382F413001AEB06A53ED9027D831179727B0865A8918" +
        "DA3EDBEBCF9B14ED44CE6CBACED4BB1BDB7F1447E6CC254B33205151" +
        "2BD7AF426FB8F401378CD2BF5983CA01C64B92ECF032EA15D1721D03" +
        "F482D7CE6E74FEF6D55E702F46980C82B5A84031900B1C9E59E7C97F" +
        "BEC7E8F323A97A7E36CC88BE0F1D45B7FF585AC54BD407B22B4154AA" +
        "CC8F6D7EBF48E1D814CC5ED20F8037E0A79715EEF29BE32806A1D58B" +
        "B7C5DA76F550AA3D8A1FBFF0EB19CCB1A313D55CDA56C9EC2EF29632" +
        "387FE8D76E3C0468043E8F663F4860EE12BF2D5B0B7474D6E694F91E" +
        "6DCC4024FFFFFFFFFFFFFFFF",
      g: 5
    },

    8192: {
      N:"FFFFFFFFFFFFFFFFC90FDAA22168C234C4C6628B80DC1CD129024E08" +
        "8A67CC74020BBEA63B139B22514A08798E3404DDEF9519B3CD3A431B" +
        "302B0A6DF25F14374FE1356D6D51C245E485B576625E7EC6F44C42E9" +
        "A637ED6B0BFF5CB6F406B7EDEE386BFB5A899FA5AE9F24117C4B1FE6" +
        "49286651ECE45B3DC2007CB8A163BF0598DA48361C55D39A69163FA8" +
        "FD24CF5F83655D23DCA3AD961C62F356208552BB9ED529077096966D" +
        "670C354E4ABC9804F1746C08CA18217C32905E462E36CE3BE39E772C" +
        "180E86039B2783A2EC07A28FB5C55DF06F4C52C9DE2BCBF695581718" +
        "3995497CEA956AE515D2261898FA051015728E5A8AAAC42DAD33170D" +
        "04507A33A85521ABDF1CBA64ECFB850458DBEF0A8AEA71575D060C7D" +
        "B3970F85A6E1E4C7ABF5AE8CDB0933D71E8C94E04A25619DCEE3D226" +
        "1AD2EE6BF12FFA06D98A0864D87602733EC86A64521F2B18177B200C" +
        "BBE117577A615D6C770988C0BAD946E208E24FA074E5AB3143DB5BFC" +
        "E0FD108E4B82D120A92108011A723C12A787E6D788719A10BDBA5B26" +
        "99C327186AF4E23C1A946834B6150BDA2583E9CA2AD44CE8DBBBC2DB" +
        "04DE8EF92E8EFC141FBECAA6287C59474E6BC05D99B2964FA090C3A2" +
        "233BA186515BE7ED1F612970CEE2D7AFB81BDD762170481CD0069127" +
        "D5B05AA993B4EA988D8FDDC186FFB7DC90A6C08F4DF435C934028492" +
        "36C3FAB4D27C7026C1D4DCB2602646DEC9751E763DBA37BDF8FF9406" +
        "AD9E530EE5DB382F413001AEB06A53ED9027D831179727B0865A8918" +
        "DA3EDBEBCF9B14ED44CE6CBACED4BB1BDB7F1447E6CC254B33205151" +
        "2BD7AF426FB8F401378CD2BF5983CA01C64B92ECF032EA15D1721D03" +
        "F482D7CE6E74FEF6D55E702F46980C82B5A84031900B1C9E59E7C97F" +
        "BEC7E8F323A97A7E36CC88BE0F1D45B7FF585AC54BD407B22B4154AA" +
        "CC8F6D7EBF48E1D814CC5ED20F8037E0A79715EEF29BE32806A1D58B" +
        "B7C5DA76F550AA3D8A1FBFF0EB19CCB1A313D55CDA56C9EC2EF29632" +
        "387FE8D76E3C0468043E8F663F4860EE12BF2D5B0B7474D6E694F91E" +
        "6DBE115974A3926F12FEE5E438777CB6A932DF8CD8BEC4D073B931BA" +
        "3BC832B68D9DD300741FA7BF8AFC47ED2576F6936BA424663AAB639C" +
        "5AE4F5683423B4742BF1C978238F16CBE39D652DE3FDB8BEFC848AD9" +
        "22222E04A4037C0713EB57A81A23F0C73473FC646CEA306B4BCBC886" +
        "2F8385DDFA9D4B7FA2C087E879683303ED5BDD3A062B3CF5B3A278A6" +
        "6D2A13F83F44F82DDF310EE074AB6A364597E899A0255DC164F31CC5" +
        "0846851DF9AB48195DED7EA1B1D510BD7EE74D73FAF36BC31ECFA268" +
        "359046F4EB879F924009438B481C6CD7889A002ED5EE382BC9190DA6" +
        "FC026E479558E4475677E9AA9E3050E2765694DFC81F56E880B96E71" +
        "60C980DD98EDD3DFFFFFFFFFFFFFFFFF",
      g: 19
    }
  }

};
