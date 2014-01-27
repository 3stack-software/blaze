
Tinytest.add("htmljs - getTag", function (test) {
  var FOO = HTML.getTag('foo');
  test.isTrue(HTML.FOO === FOO);
  var x = FOO();

  test.equal(x.tagName, 'FOO');
  test.isTrue(x instanceof HTML.FOO);
  test.isTrue(x instanceof HTML.Tag);
  test.equal(x.children, []);
  test.equal(x.attrs, null);

  test.isTrue((new FOO) instanceof HTML.FOO);
  test.isTrue((new FOO) instanceof HTML.Tag);
  test.isFalse((new HTML.P) instanceof HTML.FOO);

  var result = HTML.ensureTag('Bar');
  test.equal(typeof result, 'undefined');
  var BAR = HTML.BAR;
  test.equal(BAR().tagName, 'BAR');
});

Tinytest.add("htmljs - construction", function (test) {
  var A = HTML.getTag('A');
  var B = HTML.getTag('B');
  var C = HTML.getTag('C');

  var a = A(0, B({q:0}, C(A(B({})), 'foo')));
  test.equal(a.tagName, 'A');
  test.equal(a.attrs, null);
  test.equal(a.children.length, 2);
  test.equal(a.children[0], 0);
  var b = a.children[1];
  test.equal(b.tagName, 'B');
  test.equal(b.attrs, {q:0});
  test.equal(b.children.length, 1);
  var c = b.children[0];
  test.equal(c.tagName, 'C');
  test.equal(c.attrs, null);
  test.equal(c.children.length, 2);
  test.equal(c.children[0].tagName, 'A');
  test.equal(c.children[0].attrs, null);
  test.equal(c.children[0].children.length, 1);
  test.equal(c.children[0].children[0].tagName, 'B');
  test.equal(c.children[0].children[0].children.length, 0);
  test.equal(c.children[0].children[0].attrs, {});
  test.equal(c.children[1], 'foo');

  var a2 = new A({m:1}, {n:2}, B(), {o:3}, 'foo');
  test.equal(a2.tagName, 'A');
  test.equal(a2.attrs, {m:1});
  test.equal(a2.children.length, 4);
  test.equal(a2.children[0], {n:2});
  test.equal(a2.children[1].tagName, 'B');
  test.equal(a2.children[2], {o:3});
  test.equal(a2.children[3], 'foo');

  test.equal(A({x:1}).children.length, 0);
  var f = function () {};
  test.equal(A(new f).children.length, 1);
  test.equal(A(new Date).children.length, 1);

  test.equal(HTML.toHTML(HTML.CharRef({html: '&amp;', str: '&'})), '&amp;');
  test.throws(function () {
    HTML.CharRef({html: '&amp;'}); // no 'str'
  });
});

Tinytest.add("htmljs - utils", function (test) {

  test.notEqual("\u00c9".toLowerCase(), "\u00c9");
  test.equal(HTML.asciiLowerCase("\u00c9"), "\u00c9");

  test.equal(HTML.asciiLowerCase("Hello There"), "hello there");

  test.isTrue(HTML.isVoidElement("br"));
  test.isTrue(HTML.isVoidElement("Br"));
  test.isTrue(HTML.isVoidElement("BR"));
  test.isTrue(HTML.isVoidElement("bR"));

  test.isFalse(HTML.isVoidElement("div"));
  test.isFalse(HTML.isVoidElement("DIV"));


  test.isTrue(HTML.isKnownElement("div"));
  test.isTrue(HTML.isKnownElement("DIV"));
  test.isFalse(HTML.isKnownElement("asdf"));
  test.isFalse(HTML.isKnownElement("ASDF"));

});

Tinytest.add("htmljs - attributes", function (test) {
  var SPAN = HTML.SPAN;
  var amp = HTML.CharRef({html: '&amp;', str: '&'});

  test.equal(HTML.toHTML(SPAN({title: ['M', amp, 'Ms']}, 'M', amp, 'M candies')),
             '<span title="M&amp;Ms">M&amp;M candies</span>');

  // test that evaluateAttributes calls functions in both normal and dynamic attributes
  test.equal(HTML.evaluateAttributes({x: function () { return 'abc'; }}),
             { x: 'abc' });
  test.equal(HTML.evaluateAttributes({x: function () { return 'abc'; },
                                             $dynamic: []}),
             { x: 'abc' });
  test.equal(HTML.evaluateAttributes({x: function () { return 'abc'; },
                                             $dynamic: [{ x: function () { return 'def'; }}]}),
             { x: 'def' });
});

Tinytest.add("htmljs - details", function (test) {
  test.equal(HTML.toHTML(false), "false");
});