def test_concat():
    grade = '10'
    section = None
    try:
        s = grade + '|' + section
        print("Success:", s)
    except Exception as e:
        print("Failed:", repr(e))

test_concat()
