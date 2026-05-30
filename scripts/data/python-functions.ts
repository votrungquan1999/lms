export default {
  courseId: "c98f8f96-916d-48e0-a67b-a161c2cf422c",
  test: {
    title: "Python Practice: Functions",
    description:
      "Complete these 20 exercises about Python functions (7 easy, 7 intermediate, 6 hard). You should use concepts: def, parameters, return, calling functions, scope, and combining functions with loops/conditionals.",
    showCorrectAnswerAfterSubmit: true,
    showGradeAfterSubmit: true,
  },
  questions: [
    // ── EASY (Q1-7): Basic function definition, calling, simple params, return ──

    {
      type: "free_text" as const,
      title: "1. Say Hello",
      content: `Write a function \`say_hello()\` that prints "Hello, World!" — then call the function.
*Viết một hàm \`say_hello()\` in ra "Hello, World!" — sau đó gọi hàm đó.*

**Expected Output:**
\`\`\`
Hello, World!
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "2. Greeting with Name",
      content: `Write a function \`greet(name)\` that takes a name and prints "Hello, {name}!". Then call it with "Alice" and "Bob".
*Viết một hàm \`greet(name)\` nhận vào một tên và in ra "Hello, {name}!". Sau đó gọi hàm với "Alice" và "Bob".*

**Expected Output:**
\`\`\`
Hello, Alice!
Hello, Bob!
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "3. Square a Number",
      content: `Write a function \`square(x)\` that returns the square of x. Then print the results for 4 and 7.
*Viết một hàm \`square(x)\` trả về bình phương của x. Sau đó in kết quả cho 4 và 7.*

**Expected Output:**
\`\`\`
16
49
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "4. Add Two Numbers",
      content: `Write a function \`add(a, b)\` that takes two numbers and returns their sum. Then print the result of add(3, 5) and add(10, 20).
*Viết một hàm \`add(a, b)\` nhận hai số và trả về tổng của chúng. Sau đó in kết quả của add(3, 5) và add(10, 20).*

**Expected Output:**
\`\`\`
8
30
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "5. Check Even or Odd",
      content: `Write a function \`is_even(n)\` that returns True if n is even, and False if n is odd. Then print the results for 4, 7, and 10.
*Viết một hàm \`is_even(n)\` trả về True nếu n là số chẵn, và False nếu n là số lẻ. Sau đó in kết quả cho 4, 7, và 10.*

**Expected Output:**
\`\`\`
True
False
True
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "6. Temperature Converter",
      content: `Write a function \`to_fahrenheit(celsius)\` that converts Celsius to Fahrenheit using the formula: F = C * 9/5 + 32. Return the result. Then print the results for 0 and 100.
*Viết một hàm \`to_fahrenheit(celsius)\` chuyển đổi từ độ C sang độ F theo công thức: F = C * 9/5 + 32. Trả về kết quả. Sau đó in kết quả cho 0 và 100.*

**Expected Output:**
\`\`\`
32.0
212.0
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "7. Maximum of Two Numbers",
      content: `Write a function \`max_of_two(a, b)\` that returns the larger of two numbers. Do NOT use the built-in \`max()\` function — use an \`if\` statement instead. Then print the results for (10, 20) and (7, 3).
*Viết một hàm \`max_of_two(a, b)\` trả về số lớn hơn trong hai số. KHÔNG dùng hàm \`max()\` có sẵn — dùng câu lệnh \`if\` thay thế. Sau đó in kết quả cho (10, 20) và (7, 3).*

**Expected Output:**
\`\`\`
20
7
\`\`\``,
      weight: 10,
    },

    // ── INTERMEDIATE (Q8-14): Multiple params, combining with loops/conditionals ──

    {
      type: "free_text" as const,
      title: "8. Count Vowels",
      content: `Write a function \`count_vowels(text)\` that takes a string and returns how many vowels (a, e, i, o, u) it contains. Count both uppercase and lowercase vowels.
*Viết một hàm \`count_vowels(text)\` nhận vào một chuỗi và trả về số lượng nguyên âm (a, e, i, o, u). Đếm cả nguyên âm viết hoa và viết thường.*

**Example Input:**
\`\`\`
Hello World
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "9. Sum of a List",
      content: `Write a function \`sum_list(numbers)\` that takes a list of numbers and returns their total. Do NOT use the built-in \`sum()\` function — use a loop instead.
*Viết một hàm \`sum_list(numbers)\` nhận vào một danh sách các số và trả về tổng của chúng. KHÔNG dùng hàm \`sum()\` có sẵn — dùng vòng lặp thay thế.*

**Example Input:**
\`\`\`
10 20 30 5
\`\`\`

**Example Output:**
\`\`\`
65
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "10. Find Maximum in a List",
      content: `Write a function \`find_max(numbers)\` that takes a list of numbers and returns the largest number. Do NOT use the built-in \`max()\` function — use a loop instead.
*Viết một hàm \`find_max(numbers)\` nhận vào một danh sách các số và trả về số lớn nhất. KHÔNG dùng hàm \`max()\` có sẵn — dùng vòng lặp thay thế.*

**Example Input:**
\`\`\`
5 12 3 8 20 7
\`\`\`

**Example Output:**
\`\`\`
20
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "11. Check Palindrome",
      content: `Write a function \`is_palindrome(text)\` that returns True if the text reads the same forwards and backwards (ignore case), and False otherwise.
*Viết một hàm \`is_palindrome(text)\` trả về True nếu chuỗi đọc xuôi và đọc ngược đều giống nhau (không phân biệt hoa thường), và False nếu ngược lại.*

**Example Input/Output:**
\`\`\`
is_palindrome("Racecar")  → True
is_palindrome("Hello")    → False
is_palindrome("madam")    → True
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "12. Average Score for Multiple Students",
      content: `Write a function \`average(a, b, c)\` that returns the average of three numbers. Then use it to calculate and print the average for 3 students:
- Alice: 80, 90, 70
- Bob: 50, 65, 70
- Charlie: 95, 88, 92

*Viết một hàm \`average(a, b, c)\` trả về trung bình cộng của ba số. Sau đó dùng hàm đó để tính và in trung bình cho 3 học sinh:*
- *Alice: 80, 90, 70*
- *Bob: 50, 65, 70*
- *Charlie: 95, 88, 92*

**Expected Output:**
\`\`\`
Alice: 80.0
Bob: 61.666666666666664
Charlie: 91.66666666666667
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "13. Area and Perimeter",
      content: `Write TWO functions:
- \`area(width, height)\` — returns the area of a rectangle (width * height)
- \`perimeter(width, height)\` — returns the perimeter (2 * (width + height))

Then read width and height from input and print both results.

*Viết HAI hàm:*
- *\`area(width, height)\` — trả về diện tích hình chữ nhật (width * height)*
- *\`perimeter(width, height)\` — trả về chu vi (2 * (width + height))*

*Sau đó đọc width và height từ input và in cả hai kết quả.*

**Example Input:**
\`\`\`
5
10
\`\`\`

**Example Output:**
\`\`\`
Area: 50
Perimeter: 30
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "14. Count Character",
      content: `Write a function \`count_char(text, char)\` that takes a string and a single character, and returns how many times that character appears in the string.
*Viết một hàm \`count_char(text, char)\` nhận vào một chuỗi và một ký tự, trả về số lần ký tự đó xuất hiện trong chuỗi.*

**Example Input:**
\`\`\`
banana
a
\`\`\`

**Example Output:**
\`\`\`
3
\`\`\``,
      weight: 10,
    },

    // ── HARD (Q15-20): Combining multiple functions, problem-solving ──

    {
      type: "free_text" as const,
      title: "15. FizzBuzz Function",
      content: `Write a function \`fizzbuzz(n)\` that prints numbers from 1 to n, but:
- If a number is divisible by 3, print "Fizz" instead
- If divisible by 5, print "Buzz" instead
- If divisible by both 3 and 5, print "FizzBuzz" instead

Then call it with n = 15.

*Viết một hàm \`fizzbuzz(n)\` in các số từ 1 đến n, nhưng:*
- *Nếu số chia hết cho 3, in "Fizz" thay thế*
- *Nếu chia hết cho 5, in "Buzz" thay thế*
- *Nếu chia hết cho cả 3 và 5, in "FizzBuzz" thay thế*

*Sau đó gọi hàm với n = 15.*

**Expected Output:**
\`\`\`
1
2
Fizz
4
Buzz
Fizz
7
8
Fizz
Buzz
11
Fizz
13
14
FizzBuzz
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "16. Reverse Words",
      content: `Write a function \`reverse_words(sentence)\` that takes a sentence and returns a new string with the words in reverse order. Do NOT use built-in \`reverse()\` or slicing tricks — use a loop.
*Viết một hàm \`reverse_words(sentence)\` nhận vào một câu và trả về một chuỗi mới với các từ theo thứ tự ngược lại. KHÔNG dùng \`reverse()\` có sẵn hay kỹ thuật slicing — dùng vòng lặp.*

**Example Input:**
\`\`\`
Hello World Python
\`\`\`

**Example Output:**
\`\`\`
Python World Hello
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "17. Mini Calculator",
      content: `Write four functions: \`add(a, b)\`, \`subtract(a, b)\`, \`multiply(a, b)\`, \`divide(a, b)\`.

Then write a program that:
1. Asks the user to choose an operation (add / subtract / multiply / divide)
2. Asks for two numbers
3. Calls the correct function and prints the result
4. If the user chooses "divide" and b is 0, print "Cannot divide by zero"

*Viết bốn hàm: \`add(a, b)\`, \`subtract(a, b)\`, \`multiply(a, b)\`, \`divide(a, b)\`.*

*Sau đó viết chương trình:*
1. *Hỏi người dùng chọn phép tính (add / subtract / multiply / divide)*
2. *Hỏi hai số*
3. *Gọi hàm đúng và in kết quả*
4. *Nếu người dùng chọn "divide" và b là 0, in "Cannot divide by zero"*

**Example Input:**
\`\`\`
multiply
4
6
\`\`\`

**Example Output:**
\`\`\`
Result: 24
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "18. Grade Calculator with Loop",
      content: `Write a function \`grade(score)\` that takes a numeric score and returns a letter grade:
- 80 and above → "A"
- 60 to 79 → "B"
- 40 to 59 → "C"
- Below 40 → "F"

Then ask the user how many students there are. For each student, read their name and score, then print their name and grade using the function.

*Viết một hàm \`grade(score)\` nhận vào điểm số và trả về xếp loại:*
- *80 trở lên → "A"*
- *60 đến 79 → "B"*
- *40 đến 59 → "C"*
- *Dưới 40 → "F"*

*Sau đó hỏi có bao nhiêu học sinh. Với mỗi học sinh, đọc tên và điểm, rồi in tên và xếp loại bằng hàm đó.*

**Example Input:**
\`\`\`
3
Alice
85
Bob
55
Charlie
30
\`\`\`

**Example Output:**
\`\`\`
Alice: A
Bob: C
Charlie: F
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "19. Prime Number Checker",
      content: `Write a function \`is_prime(n)\` that returns True if n is a prime number and False otherwise. Then read a number N from input and print all prime numbers from 2 to N using your function.
*Viết một hàm \`is_prime(n)\` trả về True nếu n là số nguyên tố và False nếu không. Sau đó đọc một số N từ input và in tất cả các số nguyên tố từ 2 đến N bằng hàm của bạn.*

**Example Input:**
\`\`\`
20
\`\`\`

**Example Output:**
\`\`\`
2
3
5
7
11
13
17
19
\`\`\``,
      weight: 10,
    },
    {
      type: "free_text" as const,
      title: "20. Password Strength Checker",
      content: `Write a function \`check_password(password)\` that checks if a password is strong. A strong password must:
1. Be at least 8 characters long
2. Contain at least one digit (0-9)
3. Contain at least one uppercase letter (A-Z)

The function should print which rules the password fails (if any), or print "Strong password!" if all rules pass.

*Viết một hàm \`check_password(password)\` kiểm tra xem mật khẩu có mạnh không. Mật khẩu mạnh phải:*
1. *Có ít nhất 8 ký tự*
2. *Chứa ít nhất một chữ số (0-9)*
3. *Chứa ít nhất một chữ hoa (A-Z)*

*Hàm in ra các quy tắc mật khẩu vi phạm (nếu có), hoặc in "Strong password!" nếu tất cả đều đạt.*

**Example Input:**
\`\`\`
hello
\`\`\`

**Example Output:**
\`\`\`
Too short (minimum 8 characters)
Missing a digit
Missing an uppercase letter
\`\`\`

**Example Input:**
\`\`\`
MyPass123
\`\`\`

**Example Output:**
\`\`\`
Strong password!
\`\`\``,
      weight: 10,
    },
  ],
};
