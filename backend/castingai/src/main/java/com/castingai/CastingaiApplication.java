package com.castingai;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
@org.springframework.scheduling.annotation.EnableScheduling   // T-111 : purge de conservation chaque nuit
public class CastingaiApplication {

	public static void main(String[] args) {
		SpringApplication.run(CastingaiApplication.class, args);
	}

}
